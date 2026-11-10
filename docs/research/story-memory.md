# Story memory: rolling summaries, compaction, event importance and structure

Supports [PED-003](../pedagogy/PED-003-story-memory-and-paths.md).

**Question.** When an AI writer continues a long story from a bounded rolling memory, how should the memory be kept under its size budget without losing what the next chapter depends on? Which events should survive compaction, and should memory be text or a graph?

**Review date and access.** Sources were found through the Consensus paper search on 2026-11-10. The original abstract page (arXiv, ACL Anthology) was read the same day for the AI papers; their full texts were not reviewed. `trabassoVanDenBroek1985CausalNarrative`: abstract read in a scanned copy. `trabassoSperry1985CausalRelatedness` (found in its reference list): full text read from a PDF supplied by the requester. `vanDenBroekLorch1993CausalNetworks`: abstract supplied by the requester from the publisher page. The structure sources (arXiv) had their abstracts verified on arXiv on 2026-11-10; all are preprints. Several other sources are preprints; the tables say so.

None of these studies tests language-learning stories, graded reading or learners. They study AI summarization, agent memory and how readers judge story events. Everything below about LingoMage is extrapolation.

## Rolling summaries and their failure modes

| Key | Design and status | Finding relevant to LingoMage | Limit |
| --- | --- | --- | --- |
| `wuEtAl2021RecursiveBooks` | Fine-tuned GPT-3 with human feedback; arXiv preprint | Summarizing small sections and then summarizing those summaries produces sensible whole-book summaries, good enough for question answering about the book | A trained model, not a prompted one; quality reached human level only for a few books |
| `chang2023BooookScore` | 1,193 human annotations of GPT-4 book summaries; arXiv, notes ICLR 2024 camera-ready | Identifies eight kinds of coherence error. Incrementally updating one running summary (LingoMage's design) gives more detail but lower coherence than merging chunk summaries hierarchically | Measures coherence of a summary, not whether a writer using it stays consistent |
| `ouLapata2025ContextAwareMerging` | Experiments with Llama 3.1; arXiv, notes ACL 2025 Findings | Merging summaries of summaries can amplify hallucinations; adding source-text context while merging consistently beats plain hierarchical merging on narrative and legal data | Different models and datasets; LingoMage's compaction does not yet pass source prose |
| `wangEtAl2023RecursiveDialogueMemory` | Prompted recursive memory for chat; arXiv, notes acceptance by Neurocomputing | Updating memory from the previous memory and the new context produced more consistent responses in long conversations | Dialogue, not narrative |

## Tiered memory and how much context to send

| Key | Design and status | Finding | Limit |
| --- | --- | --- | --- |
| `packerEtAl2023MemGPT` | System design with evaluations; arXiv preprint | Moving information between a small in-context tier and larger outer tiers extends what a model can use beyond its context window | An agent architecture; shows feasibility, not which items to keep |
| `liuEtAl2024LostInMiddle` | Controlled experiments; TACL | Models use relevant information best at the start or end of the input and significantly worse in the middle of long contexts, even long-context models | Question answering and retrieval tasks, 2023 models; later models may differ |

## Which events matter

| Key | Design and status | Finding | Limit |
| --- | --- | --- | --- |
| `trabassoSperry1985CausalRelatedness` | Causal networks of six folktales (counterfactual test: without event A, would B still happen?) against adults' importance ratings (data from Brown & Smiley, 1977); Journal of Memory and Language. Full text read | Importance rose with the number of direct causal connections and was higher for events on the opening-to-closing causal chain. Together they explained on average 30.2% of rating variance (range 16.7–44.4%); connections alone uniquely explained 14.6%, chain membership only 2.1%, because chain events also have more connections. The authors also cite work finding that whether a goal is summarized depends on its causal role, not its place in a goal hierarchy | Six short folktales; adult ratings, not memory or writing; most variance is unexplained, and the paper notes content (for example emotional reactions) also lowers ratings |
| `trabassoVanDenBroek1985CausalNarrative` | Reanalysis of recall, summarization and importance data from two earlier story studies (Omanson, 1982; Stein & Glenn, 1979); Journal of Memory and Language. Abstract read in a scanned copy | Causal-chain membership and the number of causal connections each explained substantial common and unique variance in immediate recall, delayed recall, summarization and judged importance; story-grammar category added unique variance but overlapped with causal factors; concreteness, serial position and argument overlap added none | Short experimental stories, partly children's data; human readers, not models |
| `parkEtAl2023GenerativeAgents` | Agent architecture with ablations; UIST 2023 (abstract read on arXiv) | Agents store a complete record of experiences as natural-language memories, synthesize them into higher-level reflections and retrieve them dynamically; ablations show each component matters for believability | Believability of agents, not story fidelity. How retrieval weighs memories is in the full text, which was not reviewed |
| `papalampidiEtAl2020ScreenplayTurningPoints` | Extractive summarization of TV screenplays; arXiv, notes ACL 2020 | Modelling key narrative events (turning points) improved summaries, which were more complete and diverse than with generic methods | Extractive, one TV series |

## Structure: graph or text

| Key | Design and status | Finding | Limit |
| --- | --- | --- | --- |
| `vanDenBroekLorch1993CausalNetworks` | Three priming experiments, adults, brief narratives; Discourse Processes. Abstract supplied from the publisher page | Recognition of a story event was faster after a causally related prime than after an unrelated or general one, whether or not the two events were adjacent in the text: readers represent causal relations as a network, not a linear chain | Brief experimental narratives; human memory, not models |
| `sun2023EventCausality` | LLM-based event causality identification; arXiv preprint | State of the art on COPES; identified causal relations gave 3.6–16.6% relative improvement in correlation with human story-quality ratings | Story evaluation, not memory for writing |
| `romanou2023CRAB` | Benchmark of about 2,700 real-world event pairs; arXiv preprint | Most LLMs did poorly at judging causal relationships, worse for complex causal structures than for linear chains | News timelines, not fiction; models of 2023 |
| `rusu2026SelectiveForgetting` | Graph memory against a flat baseline on LongMemEval; arXiv preprint | The knowledge graph did not beat the flat baseline (token F1 0.417 vs 0.468), most clearly where questions needed the original wording; the authors limit the claim to their extraction pipeline | Conversational QA, one small extractor model |
| `wang2026Engram` | Memory engine that appends episodes, invalidates instead of deleting and keeps provenance; arXiv preprint | Facts alone lost recall; facts plus retrieved passages recovered detail. 83.6% vs 73.2% for full context on LongMemEval_S with about 9.6k instead of 79k tokens | Conversational QA; single author |
| `zhangLi2026ConsistencyGate` | Write-time admission check for memory facts; arXiv preprint | Checking support before storing a fact reduced memory contamination across four model backbones; the cost fell on facts stated only implicitly | Uses repeated model calls, not code checks |
| `tian2026NarraWorld` | Structured memory for long-form writing; arXiv preprint. Abstract read on arXiv | One shared evidence-grounded graph with four derived views: world facts, per-character beliefs, open developments and hypothetical branches; higher-level summaries (scenes, plotlines, plots) stay traceable to their source passages. Strongest aggregate results on three writing benchmarks; the memory transferred to role-play and largely preserved general recall | Preprint; abstract only; benchmarks are not graded learner stories |
| `zhouHan2025EventMemory` | Event-centric propositions with source attribution in a graph; arXiv preprint ("work in progress") | Matched or surpassed strong baselines on LoCoMo and LongMemEval_S with much shorter contexts | Conversations, not stories |
| `chhikara2025Mem0` | Production memory system with a graph variant; arXiv preprint | The graph variant scored about 2% higher overall than the base version on LOCOMO | Vendor-authored |

## Implications adopted (extrapolation)

- **Condense, do not drop.** Rolling memory is the right shape for incremental Continue, but its known weakness is lost coherence and detail. Older events are condensed into short arcs by a separate request instead of being cut (`wuEtAl2021RecursiveBooks`, `chang2023BooookScore`).
- **Protect causally linked events.** Events linked to an open thread are never condensed, and major events are condensed only when nothing else is left. Causal linkage is the best-supported predictor of event importance among those reviewed, and the number of direct connections matters more than lying on the main chain (`trabassoSperry1985CausalRelatedness`, `trabassoVanDenBroek1985CausalNarrative`); turning points carry a story's structure (`papalampidiEtAl2020ScreenplayTurningPoints`). LingoMage counts each event's links (causes, events citing it, threads, threads opened or resolved, beliefs) as a proxy for causal connections; the links are model judgments, not the counterfactual analyses of these studies.
- **Coarse importance labels, checked by code where possible.** The model labels events major or minor and links them to thread ids. Code enforces the thread links and limits, because a model's importance labels are judgments. Two levels rather than a numeric score is a product choice to reduce label noise; no reviewed study compares the two.
- **Keep memory compact rather than large.** Middle-of-context loss argues against simply raising the budget (`liuEtAl2024LostInMiddle`), so the prompt target stays 12,000 characters with a larger hard limit only as a safety net.
- **Guard against drift in compaction.** Summary-of-summary drift is documented (`ouLapata2025ContextAwareMerging`). Compaction may not introduce new names and must shorten the text; every other list is copied by code. Compaction also receives the original chapter pieces of the condensed events (up to 3000 estimated tokens), as that study suggests, and must cover every condensed event id.

- **A graph of linked events, not a knowledge graph.** Readers keep causal links as a network (`vanDenBroekLorch1993CausalNetworks`), so events link to earlier causes, not only to neighbours. Events keep their English sentences and sources, because replacing text with extracted entities lost detail (`rusu2026SelectiveForgetting`, `wang2026Engram`) and event-sized statements with sources were a strong baseline (`zhouHan2025EventMemory`); a graph variant alone added little (`chhikara2025Mem0`).
- **Code assigns ids and checks every update.** Models judge causality poorly (`romanou2023CRAB`) and a wrong fact in memory persists (`zhangLi2026ConsistencyGate`), so the model returns only changes, refers to new entries by short refs, and code assigns ids and drops links that are unknown, point forward or lack a resolving or correcting event.
- **Knowledge as a view on the same graph.** Who knows each event and what characters believe are stored alongside events (`tian2026NarraWorld`), so knowledge survives compaction and can later support continuity checks.

## Unresolved questions

- Whether condensed memory keeps the facts a writer needs over many chapters: no live long-story evaluation has been run.
- Whether a model's importance labels match what readers consider important in graded stories.
- Whether foreshadowing ("setups") is flagged reliably before it pays off.
- How often models produce links that code must drop, and whether knowledge entries are recorded only when the text supports them.
