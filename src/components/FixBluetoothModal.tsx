import React from "react";

const HTTPS_SNIPPET = `# Using mkcert for local HTTPS
devcert generate localhost
# Start vite with https
vite --https --cert ./localhost.pem --key ./localhost-key.pem`;

const PERMISSIONS_POLICY_SNIPPET = `<meta http="Permissions-Policy" content="bluetooth=(self)">
<!-- Or HTTP header -->
Permissions-Policy: bluetooth=(self)`;

const NGINX_SNIPPET = `server {
    listen 443 ssl;
    server_name trainer.example.com;

    ssl_certificate /etc/letsencrypt/live/trainer.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/trainer.example.com/privkey.pem;

    add_header Permissions-Policy "bluetooth=(self)" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;

    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
    }
}`;

const CADDY_SNIPPET = `trainer.example.com {
    tls you@example.com
    header Permissions-Policy "bluetooth=(self)"
    header Cross-Origin-Opener-Policy "same-origin"
    header Cross-Origin-Embedder-Policy "require-corp"
    reverse_proxy localhost:5173
}`;

type SnippetKey = "https" | "policy" | "nginx" | "caddy";

type FixBluetoothModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const FixBluetoothModal: React.FC<FixBluetoothModalProps> = ({ isOpen, onClose }) => {
  const [copiedKey, setCopiedKey] = React.useState<SnippetKey | null>(null);

  const handleCopy = React.useCallback((key: SnippetKey, value: string) => {
    const markCopied = () => {
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2500);
    };

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      void navigator.clipboard.writeText(value).then(markCopied);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    markCopied();
  }, []);

  React.useEffect(() => {
    if (!isOpen) {
      setCopiedKey(null);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fix-bluetooth-modal-heading"
    >
      <div className="relative flex max-h-full w-full max-w-4xl flex-col gap-6 overflow-hidden rounded-2xl bg-white p-6 shadow-2xl">
        <button
          type="button"
          className="absolute right-4 top-4 text-slate-400 transition hover:text-slate-600"
          onClick={onClose}
          aria-label="Close troubleshooting modal"
        >
          <span aria-hidden>×</span>
        </button>

        <header className="flex flex-col gap-2">
          <h2 id="fix-bluetooth-modal-heading" className="text-2xl font-semibold text-slate-900">
            Fix Web Bluetooth Connection Issues
          </h2>
          <p className="text-sm text-slate-600">
            Follow these steps to unlock Web Bluetooth in modern browsers. This checklist covers secure contexts,
            permissions policy headers, and embedding gotchas that commonly block device pairing.
          </p>
        </header>

        <section className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-slate-900">1. Serve the app over HTTPS</h3>
          <p className="text-sm text-slate-600">
            Web Bluetooth only works from a secure origin. Use a trusted certificate in production and locally via
            self-signed certificates or tooling such as <code>mkcert</code>. Upgrade all development URLs to
            <code>https://</code> before re-trying device discovery.
          </p>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">Quick start with mkcert</p>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-sky-500"
                onClick={() => handleCopy("https", HTTPS_SNIPPET)}
              >
                {copiedKey === "https" ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre className="overflow-x-auto text-xs text-slate-800">
              <code>{HTTPS_SNIPPET}</code>
            </pre>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-slate-900">2. Allow Bluetooth in the Permissions Policy</h3>
          <p className="text-sm text-slate-600">
            Chromium-based browsers require a <code>Permissions-Policy</code> header or meta tag that lists
            <code>bluetooth</code>. Without it, the Web Bluetooth API silently rejects connection requests.
          </p>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">HTML meta or response header</p>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-sky-500"
                onClick={() => handleCopy("policy", PERMISSIONS_POLICY_SNIPPET)}
              >
                {copiedKey === "policy" ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre className="overflow-x-auto text-xs text-slate-800">
              <code>{PERMISSIONS_POLICY_SNIPPET}</code>
            </pre>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-slate-900">3. Escape restrictive iframes</h3>
          <p className="text-sm text-slate-600">
            Embedded contexts frequently block Web Bluetooth because of missing <code>allow</code> tokens or sandbox
            attributes. Whenever possible, run the dashboard in a top-level tab.
          </p>
          <ul className="list-disc space-y-2 pl-6 text-sm text-slate-600">
            <li>
              Add <code>allow="bluetooth *; fullscreen *"</code> to the iframe and remove the <code>sandbox</code>
              flag or include <code>allow-scripts allow-same-origin</code>.
            </li>
            <li>
              Provide an &ldquo;Open in new tab&rdquo; escape hatch that links to the HTTPS version of the dashboard using
              <code>target="_blank" rel="noopener"</code>.
            </li>
            <li>
              If you must stay embedded, ensure the parent origin lists the child in its <code>Permissions-Policy</code>
              and <code>Cross-Origin-Embedder-Policy</code> headers.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-slate-900">4. Harden the server configuration</h3>
          <p className="text-sm text-slate-600">
            Send headers that opt into secure cross-origin isolation and expose Bluetooth permissions. Below are two
            production-ready examples you can adapt to your deployment.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <article className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-800">Nginx reverse proxy</h4>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-sky-500"
                  onClick={() => handleCopy("nginx", NGINX_SNIPPET)}
                >
                  {copiedKey === "nginx" ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre className="overflow-x-auto text-xs text-slate-800">
                <code>{NGINX_SNIPPET}</code>
              </pre>
            </article>
            <article className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-800">Caddy server</h4>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-sky-500"
                  onClick={() => handleCopy("caddy", CADDY_SNIPPET)}
                >
                  {copiedKey === "caddy" ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre className="overflow-x-auto text-xs text-slate-800">
                <code>{CADDY_SNIPPET}</code>
              </pre>
            </article>
          </div>
        </section>

        <footer className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <p className="font-semibold">Quick verification</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Reload the page over HTTPS and open DevTools &rarr; Security to confirm a secure connection.</li>
            <li>Check the Permissions Policy tab to ensure <code>bluetooth</code> is allowed for your origin.</li>
            <li>Retry scanning with the iframe removed or after opening the dedicated tab.</li>
          </ol>
        </footer>
      </div>
    </div>
  );
};

export default FixBluetoothModal;
