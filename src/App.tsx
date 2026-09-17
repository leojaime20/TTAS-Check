import {
  ArrowDownAZ,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Database,
  Download,
  FileCheck2,
  FileSpreadsheet,
  Gauge,
  LayoutDashboard,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearLocalData,
  downloadCsv,
  loadPublishedData,
  LOCAL_DATA_KEY,
  LOCAL_META_KEY,
  parseSpreadsheet,
  saveLocalData,
} from "./data";
import { REQUIREMENTS, type TtasRecord, type ValidationResult } from "./types";

const PAGE_SIZE = 50;
const REPOSITORY_UPLOAD_URL = "https://github.com/leojaime20/TTAS-Check/upload/main/public/data";

function isReady(record: TtasRecord): boolean {
  return REQUIREMENTS.every((requirement) => record[requirement.key] === "OK");
}

function completeCount(record: TtasRecord): number {
  return REQUIREMENTS.filter((requirement) => record[requirement.key] === "OK").length;
}

function StatusMark({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`status-mark ${ok ? "status-ok" : "status-open"}`} title={`${label}: ${ok ? "OK" : "NOK"}`}>
      {ok ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
      <span className="sr-only">{`${label}: ${ok ? "OK" : "NOK"}`}</span>
    </span>
  );
}

function Header({ route }: { route: string }) {
  return (
    <header className="topbar">
      <a className="brand" href="#/" aria-label="TTAS Check dashboard">
        <span className="brand-mark" aria-hidden="true"><Check /></span>
        <span><strong>TTAS</strong> Check</span>
      </a>
      <nav aria-label="Primary navigation">
        <a className={route !== "admin" ? "active" : ""} href="#/"><LayoutDashboard /> Dashboard</a>
        <a className={route === "admin" ? "active" : ""} href="#/admin"><Settings2 /> Admin</a>
      </nav>
    </header>
  );
}

function SummaryCard({ icon, label, value, detail, tone = "default" }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "green" | "yellow";
}) {
  return (
    <article className={`summary-card tone-${tone}`}>
      <span className="summary-icon">{icon}</span>
      <div><p>{label}</p><strong>{value}</strong><span>{detail}</span></div>
    </article>
  );
}

function RecordDrawer({ record, onClose }: { record: TtasRecord; onClose: () => void }) {
  const completed = completeCount(record);
  const ready = isReady(record);
  return (
    <div className="drawer-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="record-drawer" role="dialog" aria-modal="true" aria-labelledby="record-title">
        <button className="icon-button close-button" onClick={onClose} aria-label="Close details"><X /></button>
        <div className="drawer-kicker">SSOP readiness</div>
        <h2 id="record-title">{record.ssop}</h2>
        <p className="drawer-description">{record.description}</p>
        <div className={`readiness-callout ${ready ? "ready" : "pending"}`}>
          {ready ? <CheckCircle2 /> : <CircleAlert />}
          <div><strong>{ready ? "Ready for sign-off" : "Requirements remain open"}</strong><span>{completed} of {REQUIREMENTS.length} complete</span></div>
        </div>
        <div className="progress-track" aria-label={`${completed} of ${REQUIREMENTS.length} requirements complete`}>
          <span style={{ width: `${(completed / REQUIREMENTS.length) * 100}%` }} />
        </div>
        <div className="requirement-list">
          {REQUIREMENTS.map((requirement) => {
            const ok = record[requirement.key] === "OK";
            return (
              <div className="requirement-item" key={requirement.key}>
                <StatusMark ok={ok} label={requirement.label} />
                <span>{requirement.label}</span>
                <strong className={ok ? "text-ok" : "text-open"}>{ok ? "Complete" : "Open"}</strong>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

function Dashboard({ records, sourceLabel }: { records: TtasRecord[]; sourceLabel: string }) {
  const [ssopQuery, setSsopQuery] = useState("");
  const [descriptionQuery, setDescriptionQuery] = useState("");
  const [readiness, setReadiness] = useState("all");
  const [sort, setSort] = useState("ssop-asc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<TtasRecord | null>(null);

  const readyCount = useMemo(() => records.filter(isReady).length, [records]);
  const completedRequirements = useMemo(
    () => records.reduce((sum, record) => sum + completeCount(record), 0),
    [records],
  );
  const totalRequirements = records.length * REQUIREMENTS.length;
  const completion = totalRequirements ? Math.round((completedRequirements / totalRequirements) * 100) : 0;
  const openRequirements = totalRequirements - completedRequirements;

  const filtered = useMemo(() => {
    const bySsop = ssopQuery.trim().toLowerCase();
    const byDescription = descriptionQuery.trim().toLowerCase();
    const result = records.filter((record) => {
      const readinessMatch = readiness === "all" || (readiness === "ready" ? isReady(record) : !isReady(record));
      return record.ssop.toLowerCase().includes(bySsop)
        && record.description.toLowerCase().includes(byDescription)
        && readinessMatch;
    });
    return result.sort((a, b) => {
      if (sort === "ssop-desc") return b.ssop.localeCompare(a.ssop, undefined, { numeric: true });
      if (sort === "completion") return completeCount(b) - completeCount(a) || a.ssop.localeCompare(b.ssop, undefined, { numeric: true });
      return a.ssop.localeCompare(b.ssop, undefined, { numeric: true });
    });
  }, [descriptionQuery, readiness, records, sort, ssopQuery]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [ssopQuery, descriptionQuery, readiness, sort]);
  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selected]);

  return (
    <main className="page-shell">
      <section className="hero-row">
        <div>
          <span className="eyebrow">Commissioning control</span>
          <h1>TTAS readiness at a glance</h1>
          <p>Track every prerequisite required before an SSOP can be signed.</p>
        </div>
        <div className="source-pill"><Database /> {sourceLabel}</div>
      </section>

      <section className="summary-grid" aria-label="TTAS summary">
        <SummaryCard icon={<FileCheck2 />} label="Total SSOPs" value={records.length.toLocaleString()} detail="In the current dataset" />
        <SummaryCard icon={<ShieldCheck />} label="Ready to sign" value={readyCount.toLocaleString()} detail={`${records.length ? Math.round((readyCount / records.length) * 100) : 0}% of all SSOPs`} tone="green" />
        <SummaryCard icon={<Gauge />} label="Requirements complete" value={`${completion}%`} detail={`${completedRequirements.toLocaleString()} of ${totalRequirements.toLocaleString()}`} tone="yellow" />
        <SummaryCard icon={<CircleAlert />} label="Open requirements" value={openRequirements.toLocaleString()} detail={`Across ${(records.length - readyCount).toLocaleString()} SSOPs`} />
      </section>

      <section className="tracker-panel">
        <div className="filter-row">
          <label><span>SSOP</span><div className="input-wrap"><Search /><input value={ssopQuery} onChange={(event) => setSsopQuery(event.target.value)} placeholder="Search SSOP" /></div></label>
          <label className="description-filter"><span>Description</span><div className="input-wrap"><Search /><input value={descriptionQuery} onChange={(event) => setDescriptionQuery(event.target.value)} placeholder="Search description" /></div></label>
          <label><span>Readiness</span><select value={readiness} onChange={(event) => setReadiness(event.target.value)}><option value="all">All statuses</option><option value="ready">Ready to sign</option><option value="not-ready">Not ready</option></select></label>
          <label><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="ssop-asc">SSOP ascending</option><option value="ssop-desc">SSOP descending</option><option value="completion">Most complete</option></select></label>
          <button className="clear-button" onClick={() => { setSsopQuery(""); setDescriptionQuery(""); setReadiness("all"); setSort("ssop-asc"); }}><RefreshCw /> Reset</button>
        </div>

        <div className="table-meta">
          <div><strong>{filtered.length.toLocaleString()}</strong> SSOP{filtered.length === 1 ? "" : "s"} shown</div>
          <div className="legend"><span><i className="legend-dot ok" /> Complete</span><span><i className="legend-dot open" /> Open</span></div>
        </div>

        <div className="table-scroll">
          <table>
            <thead><tr><th className="ssop-column">SSOP</th><th className="description-column">Description</th>{REQUIREMENTS.map((requirement) => <th className="status-column" key={requirement.key} title={requirement.label}>{requirement.short}</th>)}<th className="action-column"><span className="sr-only">Details</span></th></tr></thead>
            <tbody>
              {visible.map((record) => (
                <tr key={record.ssop} className={isReady(record) ? "row-ready" : ""} onClick={() => setSelected(record)}>
                  <td><button className="ssop-button" onClick={() => setSelected(record)}>{record.ssop}</button></td>
                  <td className="record-description" title={record.description}>{record.description}</td>
                  {REQUIREMENTS.map((requirement) => <td className="status-cell" key={requirement.key}><StatusMark ok={record[requirement.key] === "OK"} label={requirement.label} /></td>)}
                  <td><button className="row-action" aria-label={`View ${record.ssop} details`}><ChevronRight /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && <div className="empty-state"><Search /><h3>No SSOPs found</h3><p>Try changing your filters or search terms.</p></div>}
        </div>

        <div className="pagination">
          <span>Page {page} of {pageCount}</span>
          <div><button className="icon-button" disabled={page === 1} onClick={() => setPage((current) => current - 1)} aria-label="Previous page"><ChevronLeft /></button><button className="icon-button" disabled={page === pageCount} onClick={() => setPage((current) => current + 1)} aria-label="Next page"><ChevronRight /></button></div>
        </div>
      </section>
      {selected && <RecordDrawer record={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}

function Admin({ records, onDataChanged }: { records: TtasRecord[]; onDataChanged: (records: TtasRecord[], source: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const localMeta = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(LOCAL_META_KEY) ?? "null") as { fileName: string; importedAt: string } | null; }
    catch { return null; }
  }, [message]);

  async function handleFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try { setValidation(await parseSpreadsheet(file)); }
    catch { setValidation({ records: [], errors: ["This file could not be read. Use CSV, XLSX, or XLS."], warnings: [], fileName: file.name }); }
    finally { setBusy(false); }
  }

  function applyImport() {
    if (!validation || validation.errors.length) return;
    saveLocalData(validation.records, validation.fileName);
    onDataChanged(validation.records, `Local import · ${validation.fileName}`);
    setMessage(`${validation.records.length} records are now active in this browser.`);
  }

  function restorePublished() {
    clearLocalData();
    setValidation(null);
    setMessage("Published data restored. Reloading…");
    window.setTimeout(() => window.location.reload(), 350);
  }

  return (
    <main className="page-shell admin-page">
      <section className="hero-row admin-hero">
        <div><span className="eyebrow">Data administration</span><h1>Update the TTAS dataset</h1><p>Import, validate, and prepare SSOP data without a database.</p></div>
        <div className="source-pill"><ShieldCheck /> Browser-only workspace</div>
      </section>

      <section className="workflow-strip" aria-label="Update workflow">
        <div><span>1</span><strong>Upload</strong><p>Choose CSV or Excel</p></div><ChevronRight />
        <div><span>2</span><strong>Validate</strong><p>Review data quality</p></div><ChevronRight />
        <div><span>3</span><strong>Publish</strong><p>Commit normalized CSV</p></div>
      </section>

      <div className="admin-grid">
        <section className="admin-panel import-panel">
          <div className="panel-heading"><div><span className="panel-icon"><UploadCloud /></span><div><h2>Import spreadsheet</h2><p>Accepted formats: CSV, XLSX, and XLS</p></div></div></div>
          <div
            className={`upload-zone ${dragging ? "dragging" : ""}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); void handleFile(event.dataTransfer.files[0]); }}
          >
            <span className="upload-icon"><FileSpreadsheet /></span>
            <h3>{busy ? "Reading file…" : "Drop your spreadsheet here"}</h3>
            <p>or choose a file from your device</p>
            <button className="primary-button" onClick={() => inputRef.current?.click()} disabled={busy}><UploadCloud /> Choose file</button>
            <input ref={inputRef} type="file" hidden accept=".csv,.xlsx,.xls" onChange={(event) => void handleFile(event.target.files?.[0])} />
          </div>

          {validation && (
            <div className={`validation-card ${validation.errors.length ? "has-errors" : "valid"}`}>
              <div className="validation-title">{validation.errors.length ? <CircleAlert /> : <CheckCircle2 />}<div><strong>{validation.errors.length ? "File needs attention" : "File is ready"}</strong><span>{validation.fileName}</span></div></div>
              <div className="validation-stats"><span><strong>{validation.records.length}</strong> valid records</span><span><strong>{validation.errors.length}</strong> errors</span><span><strong>{validation.warnings.length}</strong> warnings</span></div>
              {[...validation.errors.slice(0, 5), ...validation.warnings.slice(0, 3)].map((item) => <p className="validation-message" key={item}>{item}</p>)}
              {validation.errors.length > 5 && <p className="validation-message">Plus {validation.errors.length - 5} more errors.</p>}
              <div className="button-row"><button className="primary-button" disabled={!!validation.errors.length} onClick={applyImport}><CheckCircle2 /> Apply in this browser</button><button className="secondary-button" disabled={!!validation.errors.length} onClick={() => downloadCsv(validation.records)}><Download /> Download normalized CSV</button></div>
            </div>
          )}
          {message && <div className="success-message"><CheckCircle2 /> {message}</div>}
        </section>

        <aside className="admin-sidebar">
          <section className="admin-panel current-data">
            <div className="panel-heading"><div><span className="panel-icon"><Database /></span><div><h2>Current data</h2><p>{localMeta ? "Local import active" : "Published dataset active"}</p></div></div></div>
            <div className="current-stat"><strong>{records.length.toLocaleString()}</strong><span>SSOP records</span></div>
            {localMeta && <div className="meta-box"><span>Source file</span><strong>{localMeta.fileName}</strong><span>Imported {new Date(localMeta.importedAt).toLocaleString()}</span></div>}
            <div className="button-stack"><button className="secondary-button" onClick={() => downloadCsv(records)}><Download /> Export active data</button>{localStorage.getItem(LOCAL_DATA_KEY) && <button className="text-button danger" onClick={restorePublished}><RefreshCw /> Restore published data</button>}</div>
          </section>

          <section className="admin-panel publish-panel">
            <div className="panel-heading"><div><span className="panel-icon yellow"><ArrowDownAZ /></span><div><h2>Publish for everyone</h2><p>GitHub Pages is read-only at runtime</p></div></div></div>
            <ol><li>Validate and download <strong>ttas.csv</strong>.</li><li>Replace <strong>public/data/ttas.csv</strong> in GitHub.</li><li>Commit the file. Deployment runs automatically.</li></ol>
            <a className="primary-button full-button" href={REPOSITORY_UPLOAD_URL} target="_blank" rel="noreferrer">Open GitHub uploader <ArrowUpRight /></a>
            <p className="security-note"><ShieldCheck /> No passwords or GitHub tokens are stored by this page.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}

export default function App() {
  const [route, setRoute] = useState(() => window.location.hash.includes("admin") ? "admin" : "dashboard");
  const [records, setRecords] = useState<TtasRecord[]>([]);
  const [source, setSource] = useState("Loading dataset");
  const [error, setError] = useState("");

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash.includes("admin") ? "admin" : "dashboard");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    loadPublishedData()
      .then((loaded) => {
        setRecords(loaded);
        const meta = localStorage.getItem(LOCAL_META_KEY);
        if (meta) {
          const parsed = JSON.parse(meta) as { fileName: string };
          setSource(`Local import · ${parsed.fileName}`);
        } else setSource("Published dataset");
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "The dataset could not be loaded."));
  }, []);

  return (
    <div className="app">
      <Header route={route} />
      {error ? <main className="fatal-state"><CircleAlert /><h1>Data unavailable</h1><p>{error}</p></main> : records.length ? (
        route === "admin"
          ? <Admin records={records} onDataChanged={(next, nextSource) => { setRecords(next); setSource(nextSource); }} />
          : <Dashboard records={records} sourceLabel={source} />
      ) : <main className="loading-state"><span /><p>Preparing TTAS data…</p></main>}
      <footer><span>TTAS Check</span><span>Commissioning readiness control</span></footer>
    </div>
  );
}
