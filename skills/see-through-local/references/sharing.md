# Temporary sharing

`127.0.0.1` is visible only on the host PC. For an approved temporary share,
run an authenticated or quick HTTPS tunnel to `http://127.0.0.1:8010` and share
the resulting `/preview?local=<task>` address. Explain that anyone with the
link can access the viewer while the host and tunnel remain running.

Prefer Cloudflare Quick Tunnel over LocalTunnel for casual LINE sharing: the
latter may show recipients an IP-entry anti-abuse page. A temporary tunnel is
not durable hosting; use a deliberate static deployment only when the user
requests a persistent public page.
