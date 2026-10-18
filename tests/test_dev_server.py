import json
import stat
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request
from pathlib import Path

from dev_server import DevServer, Handler, atomic_write


FAKE_CODEX = r'''#!/usr/bin/env python3
import json, os, sys, time
mode = os.path.basename(sys.argv[0])
required = ['features.shell_tool=false', 'features.web_search_request=false', 'features.apply_patch_freeform=false', 'mcp_servers={}']
if any(value not in sys.argv for value in required): sys.exit(3)
for line in sys.stdin:
    message = json.loads(line)
    method = message.get('method')
    params = message.get('params') or {}
    ident = message.get('id')
    if method == 'initialized':
        continue
    if method == 'initialize': result = {}
    elif method == 'account/read': result = {'account': None if 'noaccount' in mode else {'type': 'chatgpt'}}
    elif method == 'model/list':
        result = {'data': [{'id': 'fake-model', 'displayName': 'Fake model', 'supportedReasoningEfforts': [{'reasoningEffort': 'low'}, {'reasoningEffort': 'high'}]}], 'nextCursor': None}
    elif method == 'thread/start':
        if params.get('ephemeral') is not True or params.get('runtimeWorkspaceRoots') != [] or params.get('baseInstructions') != '' or params.get('cwd','').startswith('/home/'):
            sys.stdout.write(json.dumps({'jsonrpc':'2.0','id':ident,'error':{'code':-1,'message':'thread was not isolated'}})+'\n'); sys.stdout.flush(); continue
        result = {'thread': {'id': 'thread-1'}, 'instructionSources': []}
    elif method == 'turn/start':
        sys.stdout.write(json.dumps({'jsonrpc': '2.0', 'id': ident, 'result': {'turn': {'id': 'turn-1', 'status': 'inProgress'}}}) + '\n'); sys.stdout.flush()
        value = (params.get('input') or [{}])[0].get('text', '')
        time.sleep(1.3 if 'slow-request' in value else 0.2)
        status = 'failed' if 'fail-request' in value else 'completed'
        turn = {'id': 'turn-1', 'status': status, 'items': [{'type': 'agentMessage', 'text': 'fake response'}]}
        if status == 'failed': turn['error'] = {'message': 'fake provider failure'}
        sys.stdout.write(json.dumps({'jsonrpc': '2.0', 'method': 'turn/completed', 'params': {'threadId': 'thread-1', 'turn': turn}}) + '\n'); sys.stdout.flush()
        continue
    elif method == 'turn/interrupt':
        result = {}
        sys.stdout.write(json.dumps({'jsonrpc': '2.0', 'method': 'turn/completed', 'params': {'threadId': params.get('threadId'), 'turn': {'id': params.get('turnId'), 'status': 'interrupted'}}}) + '\n'); sys.stdout.flush()
    else: result = {}
    if ident is not None:
        sys.stdout.write(json.dumps({'jsonrpc': '2.0', 'id': ident, 'result': result}) + '\n'); sys.stdout.flush()
'''


class DevelopmentServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='lingomage-test-')
        self.root = Path(self.temp.name)
        self.mock_server = DevServer(('127.0.0.1', 0), self.root, 'mock')
        self.mock_thread = threading.Thread(target=self.mock_server.serve_forever, daemon=True)
        self.mock_thread.start()
        self.live_server = None

    def tearDown(self):
        for server in (self.live_server, self.mock_server):
            if server:
                server.shutdown()
                server.server_close()
        self.temp.cleanup()

    def fake_executable(self, name='fakecodex'):
        path = self.root / name
        path.write_text(FAKE_CODEX, encoding='utf-8')
        path.chmod(path.stat().st_mode | stat.S_IXUSR)
        return str(path)

    def start_live(self, codex=None):
        self.live_server = DevServer(('127.0.0.1', 0), self.root, 'chatgpt', codex or self.fake_executable())
        self.live_server.start_chatgpt()
        threading.Thread(target=self.live_server.serve_forever, daemon=True).start()
        return self.live_server

    def post(self, server, path, value, headers=None):
        request = urllib.request.Request(
            f'http://127.0.0.1:{server.server_port}{path}',
            data=json.dumps(value).encode(), headers={'Content-Type': 'application/json', **(headers or {})},
        )
        try:
            with urllib.request.urlopen(request, timeout=4) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            try:
                return error.code, json.loads(error.read())
            finally:
                error.close()

    def ai(self, server, action, **kwargs):
        return self.post(server, '/__bridge/ai', {'action': action, **kwargs})

    def start_request(self, server, text='hello'):
        return self.ai(server, 'start', data={
            'providerId': 'chatgpt', 'model': 'fake-model', 'instructions': 'Be concise.', 'input': text,
        })

    def test_atomic_workspace_write_preserves_original_on_failure(self):
        path = self.root / 'data' / 'stories.json'
        atomic_write(path, b'original')
        with patch('dev_server.os.replace', side_effect=OSError('simulated replacement failure')):
            with self.assertRaises(OSError):
                atomic_write(path, b'replacement')
        self.assertEqual(path.read_bytes(), b'original')
        self.assertEqual(list(path.parent.iterdir()), [path])
        atomic_write(path, '日本語'.encode('utf-8'))
        self.assertEqual(path.read_text('utf-8'), '日本語')

    def test_mock_mode_and_origin_guard(self):
        status, result = self.ai(self.mock_server, 'providers')
        self.assertEqual(status, 200)
        self.assertTrue(result['providers'][0]['connected'])
        status, _ = self.post(self.mock_server, '/__bridge/ai', {'action': 'providers'}, headers={'Origin': 'http://evil.example'})
        self.assertEqual(status, 403)

    def test_mock_summary_checkpoint_and_release(self):
        previous = {key: [] for key in ('characters', 'facts', 'plot', 'unresolved', 'uncertainties', 'situation')}
        previous['characters'] = ['Mia']
        status, request_id = self.ai(self.mock_server, 'start', data={
            'providerId': 'chatgpt', 'model': 'development-mock',
            'instructions': 'Summarize.', 'input': json.dumps({
                'kind': 'summary', 'previousMemory': previous, 'chapterChunk': 'Mia finds a key.',
            }),
        })
        self.assertEqual(status, 200)
        self.mock_server.requests[request_id]['ready'] = 0
        status, raw = self.ai(self.mock_server, 'result', requestId=request_id)
        self.assertEqual(status, 200)
        result = json.loads(raw)
        self.assertEqual(result['characters'], ['Mia'])
        self.assertEqual(result['situation'], ['Mia finds a key.'])
        self.assertLessEqual(len(json.dumps(result)), 12000)
        self.assertEqual(self.ai(self.mock_server, 'acknowledge', requestId=request_id)[0], 200)
        self.assertFalse(self.mock_server.requests)

    def test_mock_language_plan_and_scopes(self):
        for language in ('de', 'ja', 'ru', 'es-CL'):
            status, request_id = self.ai(self.mock_server, 'start', data={
                'providerId': 'chatgpt', 'model': 'development-mock',
                'input': json.dumps({'kind': 'language-plan', 'languageCode': language}),
            })
            self.assertEqual(status, 200)
            self.mock_server.requests[request_id]['ready'] = 0
            plan = json.loads(self.ai(self.mock_server, 'result', requestId=request_id)[1])
            self.assertLessEqual(len(plan['vocabulary']), 5)
            self.assertLessEqual(len(plan['grammar']), 2)
            self.ai(self.mock_server, 'acknowledge', requestId=request_id)
            outputs = [json.loads(Handler.mock_story(json.dumps({'languageCode': language, 'scope': scope}))) for scope in ('scene', 'chapter')]
            self.assertLess(len(outputs[0]['story']), len(outputs[1]['story']))
            for output in outputs:
                self.assertNotIn('storySegments',output)

    def test_live_account_and_model_discovery(self):
        server = self.start_live()
        status, providers = self.ai(server, 'providers')
        self.assertTrue(providers['providers'][0]['connected'])
        status, models = self.ai(server, 'models', providerId='chatgpt')
        self.assertEqual(models['models'], [{'id': 'fake-model', 'name': 'Fake model', 'reasoningLevels': ['low', 'high']}])

    def test_disconnected_account_is_actionable(self):
        with self.assertRaisesRegex(RuntimeError, 'codex login'):
            server = DevServer(('127.0.0.1', 0), self.root, 'chatgpt', self.fake_executable('fakecodex-noaccount'))
            try:
                server.start_chatgpt()
            finally:
                server.server_close()

    def test_missing_codex_is_actionable(self):
        server = DevServer(('127.0.0.1', 0), self.root, 'chatgpt', str(self.root / 'missing-codex'))
        try:
            with self.assertRaisesRegex(RuntimeError, 'Install Codex'):
                server.start_chatgpt()
        finally:
            server.server_close()

    def test_delayed_completion_retention_and_acknowledgement(self):
        server = self.start_live()
        status, request_id = self.start_request(server)
        self.assertEqual(status, 200)
        second_status, second = self.start_request(server, 'second')
        self.assertEqual(second_status, 400)
        self.assertEqual(second['error']['code'], 'request_in_progress')
        value = None
        for _ in range(30):
            _, value = self.ai(server, 'result', requestId=request_id)
            if value is not None:
                break
            time.sleep(0.05)
        self.assertEqual(value, 'fake response')
        self.assertEqual(self.ai(server, 'acknowledge', requestId=request_id)[1], True)
        self.assertEqual(self.ai(server, 'result', requestId=request_id)[0], 400)

    def test_provider_failure_is_terminal_and_acknowledgeable(self):
        server = self.start_live()
        _, request_id = self.start_request(server, 'fail-request')
        result = None
        for _ in range(30):
            status, result = self.ai(server, 'result', requestId=request_id)
            if status != 200:
                break
            time.sleep(0.05)
        self.assertEqual(status, 400)
        self.assertIn('fake provider failure', result['error']['message'])
        self.assertEqual(self.ai(server, 'acknowledge', requestId=request_id)[1], True)

    def test_cancel_and_subprocess_shutdown(self):
        server = self.start_live()
        _, request_id = self.start_request(server, 'slow-request')
        time.sleep(0.1)
        self.assertEqual(self.ai(server, 'cancel', requestId=request_id)[1], True)
        self.assertEqual(self.ai(server, 'result', requestId=request_id)[0], 400)

        server2 = DevServer(('127.0.0.1', 0), self.root, 'chatgpt', self.fake_executable())
        server2.start_chatgpt()
        server2.server_close()
        self.assertTrue(server2.app_server.process.poll() is not None)

    def test_subprocess_failure_becomes_terminal_error(self):
        server = self.start_live()
        _, request_id = self.start_request(server, 'slow-request')
        time.sleep(0.1)
        server.app_server.process.kill()
        server.app_server.process.wait(timeout=2)
        for _ in range(30):
            status, result = self.ai(server, 'result', requestId=request_id)
            if status != 200:
                break
            time.sleep(0.05)
        self.assertEqual(status, 400)
        self.assertIn('stopped unexpectedly', result['error']['message'])


class MockStoryTests(unittest.TestCase):
    def test_matching_glossary_in_every_story_request(self):
        for language in ('de', 'ja', 'ru', 'es-CL'):
            for kind in ('story', 'continue', 'rewrite'):
                with self.subTest(language=language, kind=kind):
                    result = json.loads(Handler.mock_story(json.dumps({
                        'languageCode': language, 'kind': kind, 'practice': 'Hiking vocabulary',
                    })))
                    self.assertTrue(result['glossary'])
                    for note in result['glossary']:
                        self.assertTrue(all(form in result['story'] for form in note['forms']))
                    self.assertNotIn('storySegments', result)  # The app requests readings separately.


    def test_known_readings_and_unknown_fixture_failure(self):
        from types import SimpleNamespace
        handler = SimpleNamespace(server=SimpleNamespace(workspace=Path(__file__).resolve().parents[1]))
        result = json.loads(Handler.mock_readings(handler, {'spans': [{'id': 1, 'text': '今日'}, {'id': 9, 'text': '高'}]}))
        self.assertEqual(result['readings'], [{'id': 1, 'reading': 'きょう'}, {'id': 9, 'reading': 'たか'}])
        self.assertIn('error', json.loads(Handler.mock_readings(handler, {'spans': [{'id': 0, 'text': '未知'}]})))


if __name__ == '__main__':
    unittest.main()
