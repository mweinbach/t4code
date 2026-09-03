# OpenGrok

T4 Code can use [OpenGrok](https://github.com/mweinbach/open-grok) as a separate
agent provider. OpenGrok must be installed on the machine running the T4 server,
including when you connect from another desktop or a phone.

Open **Settings → Providers → OpenGrok** to check availability or set a custom
binary path. The default command is `open-grok`. T4 reads the models and
authentication choices advertised by that installation; the **Configured model**
choice keeps OpenGrok's current model selection. Configure authentication in
OpenGrok on the server machine before starting a thread. The availability check
reads local metadata; it does not validate credentials with the model provider.

Select **OpenGrok** when starting a thread. It has a separate provider identity
from the official Grok CLI, so changing its settings does not redirect Grok
threads. Additional OpenGrok instances can use different configuration and
environment variables.

While a turn is running, use **Steer** to send a correction into that turn.
OpenGrok accepts it at the next safe point. If the native turn finishes while
the correction is in transit, OpenGrok handles it as follow-up work and T4 tracks
its output as a continuation. Use **Queue** for a separate follow-up and
**Interrupt** to stop work. T4 supplies its thread-control MCP tools to the
agent so it can read, start, send to, and manage conversations within the allowed
project scope. See [agent thread controls](agent-thread-controls.md).

T4 launches a dedicated OpenGrok process for each managed session rather than
joining your interactive terminal's leader process. Your terminal sessions and
their lifecycle remain independent.
