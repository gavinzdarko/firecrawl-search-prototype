import "./styles.css";

type Source = "web" | "news" | "images";
type Mode = "search" | "ground";
type Freshness = "any" | "recent" | "strict";

type PrototypeRequest = {
  query: string;
  limit: number;
  sources: Source[];
  includeDomains: string[];
  excludeDomains: string[];
  freshness: Freshness;
  debug: boolean;
  contentMode?: "summary" | "markdown";
  maxContentResults?: number;
};

type PrototypeResponse = {
  requestId: string;
  outcome: {
    code: string;
    message: string;
  };
  partial: boolean;
  results: Array<{
    id: string;
    title: string;
    url: string;
    snippet: string | null;
    source: Source;
    position: number | null;
    score: number | null;
    content: string | null;
    imageUrl: string | null;
    publishedAt: string | null;
    provenance: {
      domain: string | null;
      sourceType: Source;
      inferred: boolean;
    };
  }>;
  diagnostics: {
    normalizedQuery: string;
    requestedLimit: number;
    returnedCount: number;
    filteredCount: number;
    durationMs: number;
    sourceMode: Mode;
    provider: string;
    environment: "fixture" | "live";
    warnings: string[];
    usedFixture: string | null;
    debug?: {
      rawUpstream?: RawFirecrawlResponse;
      includeDomains: string[];
      excludeDomains: string[];
      freshness: Freshness;
    };
  };
  credits: {
    estimated: number;
    used: number;
    currency: "credits";
  };
  errors: Array<{
    code: string;
    stage: string;
    message: string;
    url?: string;
  }>;
};

type RawFirecrawlResponse = {
  success?: boolean;
  warning?: string;
  creditsUsed?: number;
  data?: Partial<Record<Source, RawFirecrawlResult[]>>;
};

type RawFirecrawlResult = {
  title: string;
  description?: string;
  url: string;
  position?: number;
  markdown?: string;
  imageUrl?: string;
  date?: string;
};

type AppState = {
  apiBaseUrl: string;
  query: string;
  mode: Mode;
  limit: number;
  freshness: Freshness;
  includeDomains: string;
  excludeDomains: string;
  sources: Source[];
  contentMode: "summary" | "markdown";
  maxContentResults: number;
  loading: boolean;
  error: string | null;
  response: PrototypeResponse | null;
};

type Scenario = {
  id: string;
  label: string;
  description: string;
  apply: Partial<AppState>;
};

const scenarios: Scenario[] = [
  {
    id: "basic",
    label: "Basic lookup",
    description: "Fixture success path with clean normalized results.",
    apply: {
      query: "firecrawl funding",
      mode: "search",
      freshness: "any",
      includeDomains: "",
      excludeDomains: "",
      sources: ["web"],
    },
  },
  {
    id: "trusted",
    label: "Trusted sources",
    description: "Shows first-class include domain controls without query hacks.",
    apply: {
      query: "firecrawl search docs",
      mode: "search",
      includeDomains: "firecrawl.dev,docs.firecrawl.dev",
      excludeDomains: "",
      freshness: "recent",
      sources: ["web", "news"],
    },
  },
  {
    id: "partial",
    label: "Partial failure",
    description: "Fixture with partial enrichment and explicit errors.",
    apply: {
      query: "partial result simulation",
      mode: "ground",
      contentMode: "markdown",
      maxContentResults: 2,
      sources: ["web"],
    },
  },
  {
    id: "no-results",
    label: "No results",
    description: "Separates empty-result handling from generic success messaging.",
    apply: {
      query: "no results simulation",
      mode: "search",
      includeDomains: "",
      excludeDomains: "",
      sources: ["web"],
    },
  },
];

const state: AppState = {
  apiBaseUrl: "http://localhost:3000",
  query: "firecrawl funding",
  mode: "search",
  limit: 5,
  freshness: "any",
  includeDomains: "",
  excludeDomains: "",
  sources: ["web"],
  contentMode: "markdown",
  maxContentResults: 3,
  loading: false,
  error: null,
  response: null,
};

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("Missing app root");
}

const app: HTMLDivElement = appRoot;

function parseDomainList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function getPayload(): PrototypeRequest {
  const payload: PrototypeRequest = {
    query: state.query,
    limit: state.limit,
    sources: state.sources,
    includeDomains: parseDomainList(state.includeDomains),
    excludeDomains: parseDomainList(state.excludeDomains),
    freshness: state.freshness,
    debug: true,
  };

  if (state.mode === "ground") {
    payload.contentMode = state.contentMode;
    payload.maxContentResults = state.maxContentResults;
  }

  return payload;
}

function flattenRawResults(raw?: RawFirecrawlResponse): Array<RawFirecrawlResult & { source: Source }> {
  if (!raw?.data) {
    return [];
  }

  return (["web", "news", "images"] as const).flatMap((source) =>
    (raw.data?.[source] ?? []).map((item) => ({
      ...item,
      source,
    })),
  );
}

function renderLegendItem(className: string, label: string): string {
  return `<div class="legend-item"><span class="dot ${className}"></span>${label}</div>`;
}

function metricCard(label: string, value: string): string {
  return `<div class="metric-card"><div class="metric-label">${label}</div><div class="metric-value">${value}</div></div>`;
}

function statCard(label: string, value: string): string {
  return `<div class="stat-card"><span>${label}</span><strong>${value}</strong></div>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function previewContent(value: string | null | undefined, maxLength = 180): string {
  if (!value) {
    return "None";
  }

  return value.length > maxLength ? `${value.slice(0, maxLength).trim()}...` : value;
}

function renderResultCard(result: PrototypeResponse["results"][number]): string {
  return `
    <article class="result-card">
      <h4><a href="${result.url}" target="_blank" rel="noreferrer">${escapeHtml(result.title)}</a></h4>
      <p>${escapeHtml(result.snippet ?? "No snippet returned.")}</p>
      <div class="result-meta">
        <span class="meta-pill">source: ${result.source}</span>
        <span class="meta-pill">position: ${result.position ?? "n/a"}</span>
        <span class="meta-pill">score: ${result.score?.toFixed(2) ?? "n/a"}</span>
        <span class="meta-pill">domain: ${result.provenance.domain ?? "unknown"}</span>
      </div>
      ${
        result.content
          ? `<pre class="code-block">${escapeHtml(previewContent(result.content))}</pre>`
          : ""
      }
    </article>
  `;
}

function renderRawResultCard(result: RawFirecrawlResult & { source: Source }): string {
  return `
    <article class="result-card">
      <h4><a href="${result.url}" target="_blank" rel="noreferrer">${escapeHtml(result.title)}</a></h4>
      <p>${escapeHtml(result.description ?? "No description returned.")}</p>
      <div class="result-meta">
        <span class="meta-pill">source: ${result.source}</span>
        <span class="meta-pill">position: ${result.position ?? "n/a"}</span>
        <span class="meta-pill">content: ${result.markdown ? "included" : "missing"}</span>
      </div>
      ${
        result.markdown
          ? `<pre class="code-block">${escapeHtml(previewContent(result.markdown))}</pre>`
          : ""
      }
    </article>
  `;
}

function renderStatusPills(response: PrototypeResponse | null): string {
  if (!response) {
    return "";
  }

  return `
    <div class="status-row">
      <div class="pill">Outcome <strong>${response.outcome.code}</strong></div>
      <div class="pill">Partial <strong>${response.partial ? "yes" : "no"}</strong></div>
      <div class="pill">Environment <strong>${response.diagnostics.environment}</strong></div>
      <div class="pill">Fixture <strong>${response.diagnostics.usedFixture ?? "live"}</strong></div>
    </div>
  `;
}

function renderScenarios(): string {
  return scenarios
    .map(
      (scenario) => `
        <button class="button button-secondary" type="button" data-scenario="${scenario.id}">
          ${scenario.label}
        </button>
      `,
    )
    .join("");
}

function renderDiagnostics(response: PrototypeResponse): string {
  const debug = response.diagnostics.debug;
  return `
    <div class="surface">
      <div class="surface-header">
        <div>
          <h3>Diagnostics</h3>
          <p>Explicit pipeline metadata instead of implicit behavior.</p>
        </div>
      </div>
      <div class="stat-grid">
        ${statCard("normalized query", response.diagnostics.normalizedQuery)}
        ${statCard("provider", response.diagnostics.provider)}
        ${statCard("returned count", String(response.diagnostics.returnedCount))}
        ${statCard("filtered count", String(response.diagnostics.filteredCount))}
        ${statCard("duration", `${response.diagnostics.durationMs} ms`)}
        ${statCard("credits", `${response.credits.used} used / ${response.credits.estimated} estimated`)}
      </div>
      ${
        debug
          ? `
            <p class="footer-note">
              Include domains: <strong>${debug.includeDomains.join(", ") || "none"}</strong><br />
              Exclude domains: <strong>${debug.excludeDomains.join(", ") || "none"}</strong><br />
              Freshness: <strong>${debug.freshness}</strong>
            </p>
          `
          : ""
      }
      ${
        response.errors.length > 0
          ? `
            <div class="error-callout">
              <strong>Errors</strong>
              <pre class="code-block">${escapeHtml(JSON.stringify(response.errors, null, 2))}</pre>
            </div>
          `
          : ""
      }
    </div>
  `;
}

function renderComparison(response: PrototypeResponse | null): string {
  if (!response) {
    return `
      <div class="surface empty-state">
        Run a fixture-backed query to compare the raw Firecrawl shape against the improved wrapper response.
      </div>
    `;
  }

  const raw = response.diagnostics.debug?.rawUpstream;
  const rawResults = flattenRawResults(raw);

  return `
    <div class="comparison-grid">
      <section class="comparison-column">
        <div class="surface">
          <div class="surface-header">
            <div>
              <h2 class="tone-raw">Raw Firecrawl</h2>
              <p>What the underlying payload looks like before normalization.</p>
            </div>
          </div>
          <div class="stat-grid">
            ${statCard("query", state.query)}
            ${statCard("result count", String(rawResults.length))}
            ${statCard("success flag", raw?.success === undefined ? "n/a" : String(raw.success))}
            ${statCard("warning", raw?.warning ?? "none")}
            ${statCard("credits used", String(raw?.creditsUsed ?? 0))}
            ${statCard("partial flag", "not explicit")}
          </div>
        </div>
        <div class="surface">
          <div class="surface-header">
            <div>
              <h3>Results</h3>
              <p>Grouped upstream data with limited operational context.</p>
            </div>
          </div>
          <div class="result-list">
            ${
              rawResults.length > 0
                ? rawResults.map((result) => renderRawResultCard(result)).join("")
                : '<div class="empty-state">No raw results returned.</div>'
            }
          </div>
        </div>
        <div class="surface">
          <div class="surface-header">
            <div>
              <h3>Payload</h3>
              <p>The raw payload stays available for low-level debugging.</p>
            </div>
          </div>
          <pre class="code-block">${escapeHtml(JSON.stringify(raw ?? {}, null, 2))}</pre>
        </div>
      </section>

      <section class="comparison-column">
        <div class="surface">
          <div class="surface-header">
            <div>
              <h2 class="tone-improved">Improved Wrapper</h2>
              <p>One stable envelope with explicit outcome, diagnostics, and normalized results.</p>
            </div>
          </div>
          <div class="stat-grid">
            ${statCard("query", response.diagnostics.normalizedQuery)}
            ${statCard("result count", String(response.results.length))}
            ${statCard("outcome", response.outcome.code)}
            ${statCard("partial", response.partial ? "yes" : "no")}
            ${statCard("provider", response.diagnostics.provider)}
            ${statCard("fixture", response.diagnostics.usedFixture ?? "live")}
          </div>
        </div>
        ${renderDiagnostics(response)}
        <div class="surface">
          <div class="surface-header">
            <div>
              <h3>Results</h3>
              <p>Flattened list with position, score, provenance, and optional content.</p>
            </div>
          </div>
          <div class="result-list">
            ${
              response.results.length > 0
                ? response.results.map((result) => renderResultCard(result)).join("")
                : '<div class="empty-state">No normalized results returned.</div>'
            }
          </div>
        </div>
      </section>
    </div>
  `;
}

function render(): void {
  app.innerHTML = `
    <main class="app-shell">
      <section class="hero">
        <div class="hero-topline">Firecrawl Search Prototype</div>
        <h1>Compare the contract, not just the output.</h1>
        <p>
          This UI shows how a thin wrapper on top of Firecrawl can make search easier to debug and
          easier to build against. The left side preserves the upstream payload. The right side shows
          the same query through a cleaner request and response contract.
        </p>
        <div class="hero-metrics">
          ${metricCard("Mode", state.mode)}
          ${metricCard("Query", escapeHtml(state.query))}
          ${metricCard("Source count", String(state.sources.length))}
          ${metricCard("State", state.loading ? "Running" : state.response ? "Ready" : "Idle")}
        </div>
        ${renderStatusPills(state.response)}
      </section>

      <section class="layout">
        <aside class="panel controls">
          <h2 class="section-title">Run comparison</h2>
          <p class="section-copy">
            The API should be running locally on the base URL below. In fixture mode, the scenarios
            are deterministic and do not need a Firecrawl API key.
          </p>

          <div class="controls-grid">
            <div class="field">
              <label for="apiBaseUrl">API base URL</label>
              <input id="apiBaseUrl" name="apiBaseUrl" value="${escapeHtml(state.apiBaseUrl)}" />
            </div>

            <div class="field">
              <label for="query">Query</label>
              <input id="query" name="query" value="${escapeHtml(state.query)}" />
            </div>

            <div class="field">
              <label for="mode">Mode</label>
              <select id="mode" name="mode">
                <option value="search" ${state.mode === "search" ? "selected" : ""}>search</option>
                <option value="ground" ${state.mode === "ground" ? "selected" : ""}>ground</option>
              </select>
            </div>

            <div class="field">
              <label for="limit">Limit</label>
              <input id="limit" name="limit" type="number" min="1" max="20" value="${state.limit}" />
            </div>

            <div class="field">
              <label for="freshness">Freshness</label>
              <select id="freshness" name="freshness">
                <option value="any" ${state.freshness === "any" ? "selected" : ""}>any</option>
                <option value="recent" ${state.freshness === "recent" ? "selected" : ""}>recent</option>
                <option value="strict" ${state.freshness === "strict" ? "selected" : ""}>strict</option>
              </select>
            </div>

            <div class="field">
              <label for="includeDomains">Include domains</label>
              <input
                id="includeDomains"
                name="includeDomains"
                placeholder="firecrawl.dev,docs.firecrawl.dev"
                value="${escapeHtml(state.includeDomains)}"
              />
            </div>

            <div class="field">
              <label for="excludeDomains">Exclude domains</label>
              <input
                id="excludeDomains"
                name="excludeDomains"
                placeholder="example.com"
                value="${escapeHtml(state.excludeDomains)}"
              />
            </div>

            <div class="field">
              <div class="group-label">Sources</div>
              <div class="choices">
                ${(["web", "news", "images"] as const)
                  .map(
                    (source) => `
                      <label class="choice">
                        <input type="checkbox" name="source" value="${source}" ${
                          state.sources.includes(source) ? "checked" : ""
                        } />
                        ${source}
                      </label>
                    `,
                  )
                  .join("")}
              </div>
            </div>

            ${
              state.mode === "ground"
                ? `
                  <div class="field">
                    <label for="contentMode">Content mode</label>
                    <select id="contentMode" name="contentMode">
                      <option value="markdown" ${
                        state.contentMode === "markdown" ? "selected" : ""
                      }>markdown</option>
                      <option value="summary" ${
                        state.contentMode === "summary" ? "selected" : ""
                      }>summary</option>
                    </select>
                  </div>

                  <div class="field">
                    <label for="maxContentResults">Max content results</label>
                    <input
                      id="maxContentResults"
                      name="maxContentResults"
                      type="number"
                      min="1"
                      max="10"
                      value="${state.maxContentResults}"
                    />
                  </div>
                `
                : ""
            }

            <div class="field">
              <div class="group-label">Scenario presets</div>
              <div class="actions">
                ${renderScenarios()}
              </div>
            </div>

            <div class="actions">
              <button class="button button-primary" type="button" id="runButton" ${
                state.loading ? "disabled" : ""
              }>
                ${state.loading ? "Running comparison..." : "Run comparison"}
              </button>
              <button class="button button-secondary" type="button" id="resetButton">
                Reset defaults
              </button>
            </div>
          </div>

          <div class="legend" style="margin-top: 20px;">
            ${renderLegendItem("dot-raw", "Raw upstream shape")}
            ${renderLegendItem("dot-improved", "Normalized contract")}
          </div>

          ${
            state.error
              ? `<div class="error-callout" style="margin-top: 16px;">${escapeHtml(state.error)}</div>`
              : ""
          }

          <p class="footer-note">
            Fixture triggers: queries containing <code>partial</code> or <code>no results</code>
            map to deterministic local scenarios through the existing adapter.
          </p>
        </aside>

        <section class="panel dashboard">
          ${renderComparison(state.response)}
        </section>
      </section>
    </main>
  `;

  bindEvents();
}

function bindEvents(): void {
  const runButton = document.querySelector<HTMLButtonElement>("#runButton");
  const resetButton = document.querySelector<HTMLButtonElement>("#resetButton");
  const inputs = document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select");
  const scenarioButtons = document.querySelectorAll<HTMLButtonElement>("[data-scenario]");

  runButton?.addEventListener("click", () => {
    void runComparison();
  });

  resetButton?.addEventListener("click", () => {
    Object.assign(state, {
      apiBaseUrl: "http://localhost:3000",
      query: "firecrawl funding",
      mode: "search",
      limit: 5,
      freshness: "any",
      includeDomains: "",
      excludeDomains: "",
      sources: ["web"],
      contentMode: "markdown",
      maxContentResults: 3,
      error: null,
      response: null,
    } satisfies Partial<AppState>);
    render();
  });

  inputs.forEach((input) => {
    input.addEventListener("change", (event) => {
      const target = event.currentTarget as HTMLInputElement | HTMLSelectElement;

      if (target.name === "source" && target instanceof HTMLInputElement) {
        state.sources = Array.from(
          document.querySelectorAll<HTMLInputElement>('input[name="source"]:checked'),
        ).map((element) => element.value as Source);
        if (state.sources.length === 0) {
          state.sources = ["web"];
        }
        return;
      }

      switch (target.name) {
        case "apiBaseUrl":
          state.apiBaseUrl = target.value.trim();
          break;
        case "query":
          state.query = target.value;
          break;
        case "mode":
          state.mode = target.value as Mode;
          break;
        case "limit":
          state.limit = Number(target.value) || 5;
          break;
        case "freshness":
          state.freshness = target.value as Freshness;
          break;
        case "includeDomains":
          state.includeDomains = target.value;
          break;
        case "excludeDomains":
          state.excludeDomains = target.value;
          break;
        case "contentMode":
          state.contentMode = target.value as "summary" | "markdown";
          break;
        case "maxContentResults":
          state.maxContentResults = Number(target.value) || 3;
          break;
        default:
          break;
      }

      if (target.name === "mode") {
        render();
      }
    });
  });

  scenarioButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const scenario = scenarios.find((item) => item.id === button.dataset.scenario);
      if (!scenario) {
        return;
      }

      Object.assign(state, scenario.apply);
      state.error = null;
      render();
    });
  });
}

async function runComparison(): Promise<void> {
  state.loading = true;
  state.error = null;
  render();

  try {
    const endpoint = `${state.apiBaseUrl.replace(/\/$/, "")}/v1/search${
      state.mode === "ground" ? "/ground" : ""
    }`;
    const payload = getPayload();

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as PrototypeResponse;

    if (!response.ok) {
      throw new Error(data.outcome?.message ?? `Request failed with status ${response.status}`);
    }

    state.response = data;
  } catch (error) {
    state.response = null;
    state.error =
      error instanceof Error
        ? error.message
        : "The comparison request failed. Check that the API is running locally.";
  } finally {
    state.loading = false;
    render();
  }
}

render();
