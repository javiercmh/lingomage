#!/usr/bin/env python3
"""Local LingoMage server with optional offline mock or Codex ChatGPT inference."""
import argparse
import base64
import binascii
import json
import queue
import subprocess
import tempfile
import threading
import shutil
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit


class DevServer(HTTPServer):
    def __init__(self, address, workspace, ai_mode='off', codex='codex'):
        self.workspace = Path(workspace).resolve()
        self.ai_mode = ai_mode
        self.requests = {}
        self.request_lock = threading.Lock()
        self.ai_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='lingomage-ai')
        self.app_server = None
        self.models = []
        self.codex = codex
        super().__init__(address, Handler)

    def server_close(self):
        if self.app_server:
            self.app_server.close()
        self.ai_executor.shutdown(wait=False, cancel_futures=True)
        super().server_close()

    def start_chatgpt(self):
        self.app_server = CodexAppServer(self.codex)
        try:
            self.app_server.start()
            account = self.app_server.call('account/read', {})
            info = account.get('account') if isinstance(account, dict) else None
            if not info or info.get('type') != 'chatgpt':
                raise RuntimeError('Codex is not signed in with ChatGPT. Run `codex login`, choose ChatGPT sign-in, then restart this server.')
            cursor = None
            while True:
                params = {'includeHidden': False}
                if cursor:
                    params['cursor'] = cursor
                result = self.app_server.call('model/list', params)
                self.models.extend(result.get('data') or [])
                cursor = result.get('nextCursor')
                if not cursor:
                    break
            if not self.models:
                raise RuntimeError('Codex returned no available models. Check your ChatGPT account and Codex configuration.')
        except Exception:
            self.app_server.close()
            self.app_server = None
            raise


class CodexAppServer:
    """Small JSON-RPC client for the local Codex app-server stdio protocol."""

    def __init__(self, executable):
        self.executable = executable
        self.process = None
        self.next_id = 0
        self.write_lock = threading.Lock()
        self.pending_lock = threading.Lock()
        self.pending = {}
        self.notifications = queue.Queue()
        self.reader = None
        self.failure = None

    def start(self):
        try:
            self.process = subprocess.Popen(
                [
                    self.executable, 'app-server', '--stdio',
                    '-c', 'features.shell_tool=false',
                    '-c', 'features.web_search_request=false',
                    '-c', 'features.apply_patch_freeform=false',
                    '-c', 'mcp_servers={}',
                ],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL, text=True, encoding='utf-8', bufsize=1,
            )
        except FileNotFoundError as error:
            raise RuntimeError('Codex CLI was not found. Install Codex and run `codex login` before using --chatgpt.') from error
        self.reader = threading.Thread(target=self._read, name='codex-app-server-reader', daemon=True)
        self.reader.start()
        self.call('initialize', {
            'clientInfo': {'name': 'lingomage-dev-server', 'title': 'LingoMage development server', 'version': '1.0'},
            'capabilities': {'experimentalApi': True},
        })
        self.notify('initialized', {})

    def _read(self):
        try:
            for line in self.process.stdout:
                try:
                    message = json.loads(line)
                except ValueError:
                    continue
                if 'id' in message and ('result' in message or 'error' in message):
                    with self.pending_lock:
                        waiter = self.pending.get(message['id'])
                    if waiter:
                        waiter['message'] = message
                        waiter['event'].set()
                elif message.get('method'):
                    if 'id' in message:
                        self._respond(message['id'], {'decision': 'decline'})
                    else:
                        self.notifications.put(message)
        except (OSError, ValueError):
            pass
        self.failure = RuntimeError('Codex app-server stopped unexpectedly. Restart it and try again.')
        with self.pending_lock:
            for waiter in self.pending.values():
                waiter['event'].set()
        self.notifications.put({'method': '__closed__'})

    def _write(self, value):
        if not self.process or self.process.poll() is not None:
            raise self.failure or RuntimeError('Codex app-server is unavailable.')
        with self.write_lock:
            self.process.stdin.write(json.dumps(value, ensure_ascii=False) + '\n')
            self.process.stdin.flush()

    def _respond(self, request_id, result):
        try:
            self._write({'jsonrpc': '2.0', 'id': request_id, 'result': result})
        except Exception:
            pass

    def notify(self, method, params):
        self._write({'jsonrpc': '2.0', 'method': method, 'params': params})

    def call(self, method, params, timeout=30):
        with self.pending_lock:
            self.next_id += 1
            request_id = self.next_id
            waiter = {'event': threading.Event(), 'message': None}
            self.pending[request_id] = waiter
        try:
            self._write({'jsonrpc': '2.0', 'id': request_id, 'method': method, 'params': params})
            if not waiter['event'].wait(timeout):
                raise RuntimeError(f'Codex app-server timed out during {method}.')
            message = waiter['message']
            if not message:
                raise self.failure or RuntimeError('Codex app-server stopped unexpectedly.')
            if 'error' in message:
                error = message['error']
                raise RuntimeError(error.get('message', f'Codex app-server rejected {method}.'))
            return message.get('result') or {}
        finally:
            with self.pending_lock:
                self.pending.pop(request_id, None)

    def close(self):
        if not self.process:
            return
        try:
            self.process.terminate()
            self.process.wait(timeout=2)
        except (OSError, subprocess.TimeoutExpired):
            try:
                self.process.kill()
            except OSError:
                pass
        for stream in (self.process.stdin, self.process.stdout):
            if stream:
                try:
                    stream.close()
                except OSError:
                    pass


def model_record(model):
    levels = []
    for level in model.get('supportedReasoningEfforts') or []:
        if isinstance(level, str):
            name = level
        else:
            name = level.get('reasoningEffort') or level.get('effort') or level.get('reasoning_effort')
        if name and name not in levels:
            levels.append(name)
    return {'id': model.get('id'), 'name': model.get('displayName') or model.get('id'), 'reasoningLevels': levels}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(args[2].workspace), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_head(self):
        # Always serve current source after edits, including files changed within one second.
        if 'If-Modified-Since' in self.headers:
            del self.headers['If-Modified-Since']
        name = unquote(urlsplit(self.path).path)
        target = self.workspace_path(name.lstrip('/')) if name != '/' else self.server.workspace
        if target.is_dir():
            for name in ('index.html', 'index.htm'):
                index = target / name
                if index.exists() and not index.resolve().is_relative_to(self.server.workspace):
                    raise PermissionError('Index escapes workspace')
        return super().send_head()

    def do_HEAD(self):
        try:
            self.validate_origin()
            path = unquote(urlsplit(self.path).path)
            if path != '/':
                self.workspace_path(path.lstrip('/'))
            super().do_HEAD()
        except (PermissionError, ValueError):
            self.send_error(403)

    def workspace_path(self, name):
        relative = Path(name)
        if not name or relative.is_absolute() or '..' in relative.parts:
            raise PermissionError('Invalid workspace path')
        path = (self.server.workspace / relative).resolve()
        if path == self.server.workspace or not path.is_relative_to(self.server.workspace):
            raise PermissionError('Path escapes workspace')
        return path

    def reply(self, value, status=200, raw=False):
        content = value.encode('utf-8') if raw else json.dumps(value).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'text/plain; charset=utf-8' if raw else 'application/json')
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def files(self):
        result = []
        for path in sorted(self.server.workspace.rglob('*')):
            if path.is_file() and path.resolve().is_relative_to(self.server.workspace):
                stat = path.stat()
                result.append(dict(name=path.relative_to(self.server.workspace).as_posix(),
                                   size=stat.st_size, lastModified=int(stat.st_mtime * 1000)))
        return result

    def do_GET(self):
        self.handle_request(False)

    def do_POST(self):
        self.handle_request(True)

    def validate_origin(self):
        host = self.headers.get('Host', '')
        if host not in {f'localhost:{self.server.server_port}', f'127.0.0.1:{self.server.server_port}'}:
            raise PermissionError('Invalid host')
        origin = self.headers.get('Origin')
        if origin and origin != f'http://{host}':
            raise PermissionError('Invalid origin')

    def handle_request(self, post):
        parsed = urlsplit(self.path)
        params = parse_qs(parsed.query, keep_blank_values=True)
        param = lambda key, default='': params.get(key, [default])[0]
        try:
            # Reject cross-origin writes, including browser requests to localhost.
            self.validate_origin()
            if parsed.path == '/__bridge/info' and not post:
                return self.reply(dict(server='app2-demo-dev', mockAi=self.server.ai_mode == 'mock', liveAi=self.server.ai_mode == 'chatgpt'))
            if not parsed.path.startswith('/__bridge/'):
                if post:
                    return self.reply('Not found', 404)
                if unquote(parsed.path) != '/':
                    self.workspace_path(unquote(parsed.path).lstrip('/'))
                return super().do_GET()
            action = parsed.path.removeprefix('/__bridge/')
            body = b''
            if post:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 <= length <= 32 * 1024 * 1024:
                    return self.reply('Request too large', 413)
                body = self.rfile.read(length)
            if action == 'ai' and post:
                command = json.loads(body)
                if not isinstance(command, dict):
                    raise ValueError('Expected AI command object')
                return self.ai(command)
            if action in {'readFile', 'writeFile', 'writeFileBase64', 'deleteFile'}:
                path = self.workspace_path(param('name'))
                if action == 'readFile' and not post:
                    return self.reply(path.read_text('utf-8') if path.is_file() else '', raw=True)
                if action == 'deleteFile' and post:
                    path.unlink(missing_ok=True)
                    return self.reply(True)
                if action in {'writeFile', 'writeFileBase64'} and post:
                    if action == 'writeFileBase64':
                        text = body.decode('utf-8')
                        if text.startswith('data:'):
                            header, text = text.split(',', 1)
                            if not header.endswith(';base64'):
                                raise ValueError('Expected base64 data URL')
                        body = base64.b64decode(text, validate=True)
                    else:
                        body.decode('utf-8')
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(body)
                    return self.reply(True)
            if action in {'loadState', 'saveState', 'removeState'}:
                path = self.workspace_path('data/dev-preferences.json')
                prefs = json.loads(path.read_text('utf-8')) if path.exists() else {}
                if action == 'loadState' and not post:
                    return self.reply(prefs.get(param('key'), param('fallback')), raw=True)
                if post and action in {'saveState', 'removeState'}:
                    if action == 'saveState':
                        prefs[param('key')] = body.decode('utf-8')
                    else:
                        prefs.pop(param('key'), None)
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text(json.dumps(prefs, indent=2), 'utf-8')
                    return self.reply(True)
            if action == 'listFiles' and not post:
                return self.reply(self.files())
            if action == 'storageStats' and not post:
                files = self.files()
                disk = shutil.disk_usage(self.server.workspace)
                return self.reply(dict(usableSpaceBytes=disk.free, totalSpaceBytes=disk.total,
                                       appFilesCount=len(files), appFilesBytes=sum(f['size'] for f in files)))
            self.reply('Not found', 404)
        except PermissionError as error:
            self.reply(str(error), 403)
        except (ValueError, UnicodeError, binascii.Error) as error:
            self.reply(str(error), 400)
        except OSError as error:
            self.reply(str(error), 500)

    def ai(self, command):
        def fail(code, message):
            self.reply(dict(error=dict(code=code, message=message)), 400)
        if self.server.ai_mode == 'off':
            return fail('provider', 'Development AI is disabled. Start with --mock-ai or --chatgpt.')
        action = command.get('action')
        if action == 'providers':
            if self.server.ai_mode == 'mock':
                return self.reply(dict(providers=[dict(id='chatgpt', name='Development mock', connected=True)]))
            connected = self.server.app_server is not None
            return self.reply(dict(providers=[dict(id='chatgpt', name='ChatGPT via Codex', connected=connected)]))
        if action == 'models':
            if command.get('providerId') != 'chatgpt':
                return fail('provider', 'Unknown provider')
            if self.server.ai_mode == 'mock':
                return self.reply(dict(models=[dict(id='development-mock', name='Development mock (offline)', reasoningLevels=[])]))
            return self.reply(dict(models=[model_record(item) for item in self.server.models if item.get('id')]))
        if action == 'start':
            data = command.get('data') or {}
            if not isinstance(data, dict):
                return fail('invalid_request', 'Expected request data object')
            if data.get('providerId') != 'chatgpt' or not isinstance(data.get('model'), str) or not isinstance(data.get('input'), str):
                return fail('invalid_request', 'Select a ChatGPT model and provide a text input')
            if self.server.ai_mode == 'mock' and (data.get('model') != 'development-mock' or data.get('reasoningEffort')):
                return fail('invalid_request', 'Select the development mock model without reasoning effort')
            if self.server.ai_mode == 'chatgpt' and not any(item.get('id') == data['model'] for item in self.server.models):
                return fail('invalid_request', 'The selected ChatGPT model is not available from Codex.')
            with self.server.request_lock:
                if self.server.requests:
                    return fail('request_in_progress', 'A request is running or awaiting acknowledgement')
                request_id = ('mock-' if self.server.ai_mode == 'mock' else 'codex-') + uuid.uuid4().hex
                request = {'ready': None, 'text': None, 'error': None, 'cancelled': False}
                self.server.requests[request_id] = request
            if self.server.ai_mode == 'chatgpt':
                self.server.ai_executor.submit(self.run_live_request, request_id, data)
                return self.reply(request_id)
            try:
                request_data = json.loads(data.get('input', '{}'))
            except (TypeError, ValueError):
                request_data = {}
            if request_data.get('kind') in {'explain', 'translate'}:
                response_text = self.mock_help(request_data)
            else:
                response_text = self.mock_story(data.get('input', ''))
            request['ready'] = time.monotonic() + 1.5
            request['text'] = response_text
            return self.reply(request_id)
        request_id = command.get('requestId')
        if not isinstance(request_id, str):
            return fail('invalid_request', 'Expected request ID')
        request = self.server.requests.get(request_id)
        if request is None:
            return fail('not_found', 'Request not found')
        if action == 'result':
            if request.get('error'):
                return fail(request['error'].get('code', 'provider'), request['error'].get('message', 'ChatGPT request failed.'))
            if request.get('text') is None or (request.get('ready') and time.monotonic() < request['ready']):
                return self.reply(None)
            return self.reply(request['text'])
        if action in {'cancel', 'acknowledge'}:
            if action == 'acknowledge' and request.get('text') is None and not request.get('error'):
                return fail('invalid_request', 'Request is still running')
            if action == 'cancel' and self.server.ai_mode == 'chatgpt':
                request['cancelled'] = True
                if request.get('threadId') and request.get('turnId'):
                    try:
                        self.server.app_server.call('turn/interrupt', {'threadId': request['threadId'], 'turnId': request['turnId']}, timeout=5)
                    except Exception:
                        pass
            with self.server.request_lock:
                self.server.requests.pop(request_id, None)
            self.cleanup_live_request(request)
            return self.reply(True)
        return fail('invalid_request', 'Unknown action')

    def run_live_request(self, request_id, data):
        request = self.server.requests.get(request_id)
        if not request:
            return
        app_server = self.server.app_server
        try:
            workdir = tempfile.mkdtemp(prefix='lingomage-codex-')
            request['workdir'] = workdir
            thread = app_server.call('thread/start', {
                'ephemeral': True,
                'cwd': workdir,
                'runtimeWorkspaceRoots': [],
                'baseInstructions': '',
                'developerInstructions': data.get('instructions') or 'Answer the user request directly. Do not use tools, browse, or execute commands.',
                'approvalPolicy': 'never',
                'sandbox': 'read-only',
                'model': data['model'],
                'selectedCapabilityRoots': [],
            })
            thread_id = (thread.get('thread') or {}).get('id')
            if not thread_id:
                raise RuntimeError('Codex did not create an isolated inference thread.')
            if thread.get('instructionSources'):
                raise RuntimeError('Codex loaded project instructions into the isolated inference thread.')
            request['threadId'] = thread_id
            if request.get('cancelled'):
                return
            turn = app_server.call('turn/start', {
                'threadId': thread_id,
                'input': [{'type': 'text', 'text': data['input']}],
                'model': data['model'],
                'effort': data.get('reasoningEffort') or None,
                'cwd': workdir,
                'runtimeWorkspaceRoots': [],
                'approvalPolicy': 'never',
            })
            turn_value = turn.get('turn') or {}
            request['turnId'] = turn_value.get('id')
            if request.get('cancelled') and request['turnId']:
                try:
                    app_server.call('turn/interrupt', {'threadId': thread_id, 'turnId': request['turnId']}, timeout=5)
                except Exception:
                    pass
                return
            if turn_value.get('status') in {'completed', 'failed', 'interrupted'}:
                self.finish_live_request(request, turn_value)
                return
            while not request.get('cancelled'):
                try:
                    message = app_server.notifications.get(timeout=0.5)
                except queue.Empty:
                    if app_server.failure:
                        raise app_server.failure
                    continue
                method = message.get('method')
                params = message.get('params') or {}
                if method == 'turn/completed' and params.get('threadId') == thread_id:
                    self.finish_live_request(request, params.get('turn') or {})
                    return
                if method == 'error' and params.get('threadId') == thread_id:
                    raise RuntimeError(params.get('message') or 'ChatGPT request failed.')
                if method == '__closed__':
                    raise app_server.failure or RuntimeError('Codex app-server stopped unexpectedly.')
        except Exception as error:
            if not request.get('cancelled'):
                request['error'] = {'code': 'provider', 'message': str(error)}
        finally:
            if request.get('cancelled'):
                self.cleanup_live_request(request)

    @staticmethod
    def finish_live_request(request, turn):
        status = turn.get('status')
        if status != 'completed':
            error = turn.get('error') or {}
            message = error.get('message') if isinstance(error, dict) else str(error)
            request['error'] = {'code': 'provider', 'message': message or f'ChatGPT request {status or "failed"}.'}
            return
        texts = []
        for item in turn.get('items') or []:
            if item.get('type') in {'agentMessage', 'assistantMessage'} and isinstance(item.get('text'), str):
                texts.append(item['text'])
        if not texts:
            request['error'] = {'code': 'provider', 'message': 'Codex completed the request without a text response.'}
        else:
            request['text'] = '\n'.join(texts)

    @staticmethod
    def cleanup_live_request(request):
        workdir = request.pop('workdir', None)
        if workdir:
            shutil.rmtree(workdir, ignore_errors=True)

    def mock_help(self, data):
        """Render fixed examples of the response contract; never perform inference."""
        fixtures = json.loads((self.server.workspace / 'data/reader-help-fixtures.json').read_text())
        fixture = fixtures.get(data.get('languageCode'), fixtures['de'])
        source = str(data.get('sourceText', ''))
        passage = str(data.get('passage', ''))
        action = data.get('action', 'initial')
        utf16_len = lambda text: len(text.encode('utf-16-le')) // 2
        context_index = source.find(fixture['context'])
        expected_start = utf16_len(source[:context_index]) + utf16_len(fixture['context'][:fixture['selectionStart']]) if context_index >= 0 else -1
        matched = passage == fixture['selection'] and data.get('start') == expected_start and data.get('end') == expected_start + utf16_len(passage)
        if action in {'detail', 'examples'} and not matched:
            return json.dumps({'explanation': 'This selection has no dedicated offline follow-up fixture. Connect a model in App² to request help for this passage.'})
        if action == 'examples':
            examples = []
            for sample in fixture['examples']:
                item = {key: value for key, value in sample.items() if key != 'highlight'}
                start = sample['sentence'].index(sample['highlight'])
                item['highlightStart'] = utf16_len(sample['sentence'][:start])
                item['highlightEnd'] = item['highlightStart'] + utf16_len(sample['highlight'])
                examples.append(item)
            return json.dumps({'examples': examples}, ensure_ascii=False)
        if action == 'detail':
            return json.dumps({'explanation': fixture['detail']}, ensure_ascii=False)
        context = fixture['context'] if matched else str(data.get('sentence', passage))
        start = source.find(context)
        explanation = fixture['explanation'] if matched else 'This selection has no dedicated offline explanation fixture. Connect a model in App² to request an explanation for this passage.'
        return json.dumps({'contextStart': utf16_len(source[:start]) if start >= 0 else -1,
                           'contextEnd': utf16_len(source[:start]) + utf16_len(context) if start >= 0 else -1,
                           'contextTranslation': '', 'explanation': explanation}, ensure_ascii=False)

    @staticmethod
    def mock_story(raw_input):
        """Return a deterministic, labelled-fixture story for the LingoMage preview."""
        try:
            data = json.loads(raw_input)
        except (TypeError, ValueError):
            data = {}
        code = data.get('languageCode')
        words = data.get('targetWords') if isinstance(data.get('targetWords'), list) else []
        words = [str(word) for word in words[:10]]
        samples = {
            'de': ('Ein kleiner Ausflug', 'Am Morgen gehen Mia und Leo zum Markt. Sie sehen viele Menschen und hören leise Musik. Mia kauft Brot und Leo findet einen roten Ball. Zusammen gehen sie zum Fluss. Die Sonne scheint, und der Tag ist sehr schön. Am Abend erzählen sie ihrer Familie von dem kleinen Ausflug.'),
            'ja': ('小さな一日', '今日はミアが町へ行きます。\n店でパンを買います。友だちと公園で話します。\n空は青く、風はやさしいです。\n二人は笑って家へ帰ります。'),
            'ru': ('Небольшая прогулка', 'Утром Маша идет на рынок. Там она встречает друга и покупает хлеб. Потом они гуляют у реки и слушают музыку. День теплый и спокойный. Вечером Маша возвращается домой и рассказывает семье о прогулке.'),
            'es-CL': ('Una tarde tranquila', 'Sofía sale a caminar por el barrio. Pasa por una feria y compra pan y palta. Después se junta con una amiga en una plaza. Conversan un rato y miran el cielo. Cuando baja el sol, vuelven a casa contentas.'),
        }
        title, story = samples.get(code, samples['de'])
        glossary = [{'word': word, 'meaning': f'Development example for {word}', 'forms': [word]} for word in words]
        if code == 'ja':
            story_segments = [
                {'text':'今日','reading':'きょう'}, {'text':'はミアが'}, {'text':'町','reading':'まち'}, {'text':'へ'}, {'text':'行','reading':'い'}, {'text':'きます。\n'},
                {'text':'店','reading':'みせ'}, {'text':'でパンを'}, {'text':'買','reading':'か'}, {'text':'います。友だちと'}, {'text':'公園','reading':'こうえん'}, {'text':'で'}, {'text':'話','reading':'はな'}, {'text':'します。\n'},
                {'text':'空','reading':'そら'}, {'text':'は'}, {'text':'青','reading':'あお'}, {'text':'く、'}, {'text':'風','reading':'かぜ'}, {'text':'はやさしいです。\n'},
                {'text':'二人','reading':'ふたり'}, {'text':'は'}, {'text':'笑','reading':'わら'}, {'text':'って'}, {'text':'家','reading':'いえ'}, {'text':'へ'}, {'text':'帰','reading':'かえ'}, {'text':'ります。'}
            ]
            return json.dumps({'title': title, 'story': story,
                               'titleSegments': [{'text': '小', 'reading': 'ちい'}, {'text': 'さな一日', 'reading': ''}],
                               'storySegments': story_segments, 'glossary': glossary}, ensure_ascii=False)
        return json.dumps({'title': title, 'story': story,
                           'titleSegments': [{'text': title}],
                           'storySegments': [{'text': story}], 'glossary': glossary}, ensure_ascii=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('port', nargs='?', type=int, default=8888)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--mock-ai', action='store_true', help='Enable deterministic offline AI responses')
    modes.add_argument('--chatgpt', action='store_true', help='Use ChatGPT through the local Codex CLI login')
    parser.add_argument('--codex', default='codex', help='Codex CLI executable for --chatgpt (default: codex)')
    args = parser.parse_args()
    ai_mode = 'mock' if args.mock_ai else 'chatgpt' if args.chatgpt else 'off'
    server = DevServer(('127.0.0.1', args.port), Path(__file__).parent, ai_mode, args.codex)
    if args.chatgpt:
        try:
            server.start_chatgpt()
        except Exception as error:
            server.server_close()
            parser.error(str(error))
    with server:
        print(f'LingoMage: http://localhost:{server.server_port}', flush=True)
        print(f'Reading and writing real files in: {server.workspace}', flush=True)
        if ai_mode == 'mock':
            print('Development mock AI: enabled (offline; no provider usage)', flush=True)
        elif ai_mode == 'chatgpt':
            print('Development ChatGPT AI: enabled through Codex CLI; requests may use your ChatGPT plan.', flush=True)
        else:
            print('Development AI: disabled', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print('\nServer stopped.')
