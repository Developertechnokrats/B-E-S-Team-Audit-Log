import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Papa from 'papaparse';
import readXlsxFile from 'read-excel-file';
import {
  Building2,
  Check,
  ChevronDown,
  Database,
  FileSpreadsheet,
  Filter,
  Lock,
  LogOut,
  ShieldCheck,
  Upload,
  UserRound,
  Users,
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import './styles.css';

const requiredHeaders = ['Document ID', 'Document Name', 'Module', 'Action', 'Modified By (Id)', 'Date & Time', 'Details'];
const INSERT_BATCH_SIZE = 1000;
const DEFAULT_PAGE_SIZE = 1000;

const demoAccounts = [
  { id: 'acc-north', name: 'Northwind Legal' },
  { id: 'acc-apex', name: 'Apex Finance' },
  { id: 'acc-orbit', name: 'Orbit Health' },
];

const demoProfile = {
  id: 'demo-admin',
  full_name: 'Admin Demo',
  role: 'admin',
};

const demoRows = [
  {
    id: 'row-1',
    account_id: 'acc-north',
    document_id: 'DOC-1042',
    document_name: 'Vendor Contract',
    module: 'Contracts',
    action: 'Updated',
    details: 'Clause text changed',
    modified_by_id: 'U102',
    modified_by_name: 'Priya Sharma',
    modified_at: '2026-06-19T10:32:00+05:30',
  },
  {
    id: 'row-2',
    account_id: 'acc-north',
    document_id: 'DOC-1099',
    document_name: 'Board Minutes',
    module: 'Governance',
    action: 'Viewed',
    details: 'Opened from dashboard',
    modified_by_id: 'U311',
    modified_by_name: 'Rohan Mehta',
    modified_at: '2026-06-20T16:14:00+05:30',
  },
  {
    id: 'row-3',
    account_id: 'acc-apex',
    document_id: 'FIN-882',
    document_name: 'Q2 Forecast',
    module: 'Planning',
    action: 'Approved',
    details: 'Approved by finance lead',
    modified_by_id: 'F044',
    modified_by_name: 'Anika Rao',
    modified_at: '2026-06-21T09:05:00+05:30',
  },
];

const demoMappings = [
  { id: 'map-1', account_id: 'acc-north', modified_by_id: 'U102', display_name: 'Priya Sharma' },
  { id: 'map-2', account_id: 'acc-north', modified_by_id: 'U311', display_name: 'Rohan Mehta' },
  { id: 'map-3', account_id: 'acc-apex', modified_by_id: 'F044', display_name: 'Anika Rao' },
];

function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!authReady) {
    return <LoadingScreen />;
  }

  if (!isSupabaseConfigured) {
    return <Dashboard mode="demo" session={null} />;
  }

  return session ? <Dashboard mode="live" session={session} /> : <AuthScreen />;
}

function LoadingScreen() {
  return (
    <main className="center-screen">
      <div className="loader" />
    </main>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    const method = mode === 'signin' ? 'signInWithPassword' : 'signUp';
    const { error } = await supabase.auth[method]({ email, password });

    if (error) {
      setMessage(error.message);
    } else if (mode === 'signup') {
      setMessage('Account created. Ask an admin to assign a role and accounts.');
    }

    setLoading(false);
  }

  return (
    <main className="auth-layout">
      <section className="auth-intro">
        <div className="brand-badge">
          <FileSpreadsheet size={22} />
        </div>
        <h1>Document Activity Dashboard</h1>
        <p>Secure account-based upload, ID mapping, and filtering for document audit data.</p>
        <div className="trust-item">
          <ShieldCheck size={18} />
          Supabase Auth and RLS protect account access.
        </div>
      </section>

      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="segmented">
          <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>
            Sign in
          </button>
          <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
            Create user
          </button>
        </div>

        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>

        <label>
          Password
          <input
            type="password"
            minLength="6"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        {message && <p className="form-message">{message}</p>}

        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? 'Working...' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </main>
  );
}

function Dashboard({ mode, session }) {
  const [profile, setProfile] = useState(demoProfile);
  const [accounts, setAccounts] = useState(demoAccounts);
  const [activeAccountId, setActiveAccountId] = useState(demoAccounts[0].id);
  const [rows, setRows] = useState(demoRows);
  const [mappings, setMappings] = useState(demoMappings);
  const [filters, setFilters] = useState(emptyFilters());
  const [filterOptions, setFilterOptions] = useState({ modules: [], actions: [] });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalRows, setTotalRows] = useState(demoRows.filter((row) => row.account_id === demoAccounts[0].id).length);
  const [status, setStatus] = useState(mode === 'demo' ? 'Demo mode: add Supabase env vars to use live data.' : '');
  const [importProgress, setImportProgress] = useState(null);
  const [loading, setLoading] = useState(false);

  const activeAccount = accounts.find((account) => account.id === activeAccountId);
  const canUpload = profile.role === 'admin';

  useEffect(() => {
    setPage(1);
  }, [activeAccountId, filters]);

  useEffect(() => {
    if (mode !== 'live' || !session) return;
    loadLiveData(session.user.id);
  }, [mode, session]);

  async function loadLiveData(userId) {
    setLoading(true);
    setStatus('');

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', userId)
      .single();

    if (profileError) {
      setStatus('Profile missing. Add this user to the profiles table first.');
      setLoading(false);
      return;
    }

    const { data: accountData, error: accountError } = await supabase.from('accounts').select('id, name').order('name');

    if (accountError) {
      setStatus(accountError.message);
      setLoading(false);
      return;
    }

    setProfile(profileData);
    setAccounts(accountData || []);
    setActiveAccountId((accountData && accountData[0]?.id) || '');
    setLoading(false);
  }

  useEffect(() => {
    if (!activeAccountId) return;
    refreshAccountData(activeAccountId);
    // refreshAccountData intentionally reads the current filters and pagination state.
    // Rebuilding it as a callback here makes the data-flow harder to follow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeAccountId, filters, page, pageSize]);

  async function refreshAccountData(accountId) {
    setLoading(true);

    if (mode !== 'live') {
      const demoAccountRows = demoRows.filter((row) => row.account_id === accountId);
      const filteredDemoRows = filterRows(applyMappings(demoAccountRows, mappings), filters);
      const start = (page - 1) * pageSize;
      setRows(filteredDemoRows.slice(start, start + pageSize));
      setTotalRows(filteredDemoRows.length);
      setFilterOptions({
        modules: sortedUnique(demoAccountRows.map((row) => row.module)),
        actions: sortedUnique(demoAccountRows.map((row) => row.action)),
      });
      setLoading(false);
      return;
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let rowQuery = supabase
        .from('document_activity_view')
        .select('*', { count: 'exact' })
        .eq('account_id', accountId)
        .order('modified_at', { ascending: false })
        .range(from, to);

    rowQuery = applyServerFilters(rowQuery, filters);

    const [{ data: rowData, error: rowError, count }, { data: mappingData, error: mappingError }, optionsResult] = await Promise.all([
      rowQuery,
      supabase.from('modifier_mappings').select('*').eq('account_id', accountId).order('modified_by_id'),
      loadFilterOptions(accountId),
    ]);

    if (rowError || mappingError) {
      setStatus(rowError?.message || mappingError?.message);
    } else {
      setRows(rowData || []);
      setMappings(mappingData || []);
      setTotalRows(count || 0);
      setFilterOptions(optionsResult);
    }

    setLoading(false);
  }

  const accountRows = useMemo(() => rows.filter((row) => row.account_id === activeAccountId), [rows, activeAccountId]);
  const mappedRows = useMemo(() => applyMappings(accountRows, mappings), [accountRows, mappings]);
  const stats = useMemo(() => getStats(mappedRows), [mappedRows]);
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  async function handleFileUpload(file) {
    if (!canUpload || !file || !activeAccountId) return;

    setLoading(true);
    setImportProgress({
      phase: 'Parsing file',
      fileName: file.name,
      processed: 0,
      total: 0,
      percent: 0,
      detail: 'Reading rows from your file...',
    });
    setStatus(`Parsing ${file.name}...`);

    try {
      const parsedRows = await parseUploadFile(file, ({ processed, total, percent }) => {
        setImportProgress({
          phase: 'Parsing file',
          fileName: file.name,
          processed,
          total,
          percent,
          detail: total ? `${formatNumber(processed)} of ${formatNumber(total)} rows parsed` : 'Parsing rows...',
        });
      });
      const normalizedRows = parsedRows.map((row, index) => normalizeUploadRow(row, index, activeAccountId));
      const validRows = normalizedRows.filter(Boolean);

      if (!validRows.length) {
        throw new Error('No valid rows found. Check the headers and date values.');
      }

      if (mode === 'live') {
        setImportProgress({
          phase: 'Creating upload record',
          fileName: file.name,
          processed: 0,
          total: validRows.length,
          percent: 0,
          detail: `${formatNumber(validRows.length)} valid rows ready to import`,
        });

        const { data: upload, error: uploadError } = await supabase
          .from('uploads')
          .insert({
            account_id: activeAccountId,
            uploaded_by: session.user.id,
            file_name: file.name,
            row_count: validRows.length,
            imported_count: 0,
          })
          .select('id')
          .single();

        if (uploadError) throw uploadError;

        const importResult = await insertRowsInBatches({
          rows: validRows,
          uploadId: upload.id,
          fileName: file.name,
          onProgress: setImportProgress,
        });

        const { error: uploadUpdateError } = await supabase
          .from('uploads')
          .update({
            imported_count: importResult.imported,
          })
          .eq('id', upload.id);

        if (uploadUpdateError) throw uploadUpdateError;

        await refreshAccountData(activeAccountId);
      } else {
        setRows((currentRows) => [
          ...validRows.map((row) => ({
            ...row,
            id: crypto.randomUUID(),
            modified_by_name: findMappingName(mappings, row.account_id, row.modified_by_id),
          })),
          ...currentRows,
        ]);
      }

      setImportProgress({
        phase: 'Import complete',
        fileName: file.name,
        processed: validRows.length,
        total: validRows.length,
        percent: 100,
        detail: `${formatNumber(validRows.length)} rows processed successfully`,
      });
      setStatus(`Uploaded ${validRows.length} rows to ${activeAccount?.name || 'selected account'}.`);
    } catch (error) {
      setImportProgress((current) => ({
        ...(current || {}),
        phase: 'Import failed',
        fileName: file.name,
        detail: error.message,
      }));
      setStatus(error.message);
    }

    setLoading(false);
  }

  async function saveMapping(mapping) {
    if (!activeAccountId || !mapping.modified_by_id.trim() || !mapping.display_name.trim()) return;

    const payload = {
      account_id: activeAccountId,
      modified_by_id: mapping.modified_by_id.trim(),
      display_name: mapping.display_name.trim(),
      updated_by: mode === 'live' ? session.user.id : null,
    };

    if (mode === 'live') {
      const { error } = await supabase
        .from('modifier_mappings')
        .upsert(payload, { onConflict: 'account_id,modified_by_id' });

      if (error) {
        setStatus(error.message);
        return;
      }

      await refreshAccountData(activeAccountId);
    } else {
      setMappings((currentMappings) => {
        const withoutExisting = currentMappings.filter(
          (item) => !(item.account_id === activeAccountId && item.modified_by_id === payload.modified_by_id),
        );
        return [{ id: crypto.randomUUID(), ...payload }, ...withoutExisting];
      });
    }

    setStatus(`Mapped ${payload.modified_by_id} to ${payload.display_name}.`);
  }

  async function handleSignOut() {
    if (mode === 'live') {
      await supabase.auth.signOut();
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-line">
          <div className="brand-badge small">
            <Database size={19} />
          </div>
          <div>
            <strong>Activity Hub</strong>
            <span>{mode === 'demo' ? 'Demo workspace' : 'Supabase workspace'}</span>
          </div>
        </div>

        <label className="account-switcher">
          Account
          <div className="select-wrap">
            <Building2 size={17} />
            <select value={activeAccountId} onChange={(event) => setActiveAccountId(event.target.value)}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            <ChevronDown size={16} />
          </div>
        </label>

        <nav className="side-nav">
          <a href="#activity">
            <FileSpreadsheet size={17} />
            Activity
          </a>
          <a href="#upload">
            <Upload size={17} />
            Upload
          </a>
          <a href="#mappings">
            <Users size={17} />
            ID mappings
          </a>
        </nav>

        <div className="user-panel">
          <UserRound size={18} />
          <div>
            <strong>{profile.full_name}</strong>
            <span>{profile.role}</span>
          </div>
        </div>

        {mode === 'live' && (
          <button className="ghost-button" type="button" onClick={handleSignOut}>
            <LogOut size={16} />
            Sign out
          </button>
        )}
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Selected account</p>
            <h1>{activeAccount?.name || 'No account assigned'}</h1>
          </div>
          <div className="role-pill">
            <ShieldCheck size={16} />
            {canUpload ? 'Admin access' : 'View only'}
          </div>
        </header>

        {status && <div className="status-banner">{status}</div>}

        <section className="stats-grid">
          <Stat label="Rows" value={formatNumber(totalRows)} />
          <Stat label="Modules" value={filterOptions.modules.length || stats.modules} />
          <Stat label="Users mapped" value={stats.people} />
          <Stat label="Last activity" value={stats.lastActivity} />
        </section>

        <section className="panel" id="activity">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Document data</p>
              <h2>Activity records</h2>
            </div>
            <button className="ghost-button compact" type="button" onClick={() => setFilters(emptyFilters())}>
              Clear filters
            </button>
          </div>

          <Filters filters={filters} setFilters={setFilters} options={filterOptions} />
          <ActivityTable rows={mappedRows} loading={loading} />
          <Pagination
            page={page}
            pageSize={pageSize}
            totalRows={totalRows}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </section>

        <section className="two-column">
          <UploadPanel canUpload={canUpload} onUpload={handleFileUpload} loading={loading} progress={importProgress} />
          <MappingPanel canEdit={canUpload} mappings={mappings} accountId={activeAccountId} onSave={saveMapping} />
        </section>
      </section>
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Filters({ filters, setFilters, options }) {
  return (
    <div className="filters">
      <div className="filter-title">
        <Filter size={17} />
        Filters
      </div>
      <label>
        Document ID
        <input
          type="search"
          value={filters.documentId}
          onChange={(event) => setFilters((current) => ({ ...current, documentId: event.target.value }))}
          placeholder="Document ID"
        />
      </label>
      <label>
        Document Name
        <input
          type="search"
          value={filters.documentName}
          onChange={(event) => setFilters((current) => ({ ...current, documentName: event.target.value }))}
          placeholder="Document Name"
        />
      </label>
      <label>
        Module
        <select value={filters.module} onChange={(event) => setFilters((current) => ({ ...current, module: event.target.value }))}>
          <option value="">All modules</option>
          {options.modules.map((module) => (
            <option key={module} value={module}>
              {module}
            </option>
          ))}
        </select>
      </label>
      <label>
        Action
        <select value={filters.action} onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))}>
          <option value="">All actions</option>
          {options.actions.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </select>
      </label>
      <label>
        Modified By
        <input
          type="search"
          value={filters.modifiedBy}
          onChange={(event) => setFilters((current) => ({ ...current, modifiedBy: event.target.value }))}
          placeholder="ID or name"
        />
      </label>
      <label>
        From date
        <input
          type="date"
          value={filters.from}
          onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
        />
      </label>
      <label>
        To date
        <input
          type="date"
          value={filters.to}
          onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
        />
      </label>
    </div>
  );
}

function ActivityTable({ rows, loading }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Document ID</th>
            <th>Document Name</th>
            <th>Module</th>
            <th>Action</th>
            <th>Details</th>
            <th>Modified By</th>
            <th>Date & Time</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan="7" className="empty-cell">
                Loading records...
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((row) => (
              <tr key={row.id}>
                <td>{row.document_id}</td>
                <td>{row.document_name}</td>
                <td>{row.module}</td>
                <td>
                  <span className="action-chip">{row.action}</span>
                </td>
                <td className="details-cell">{row.details || '-'}</td>
                <td>
                  <strong>{row.modified_by_name}</strong>
                  <span className="subtle">{row.modified_by_id}</span>
                </td>
                <td>{formatDateTime(row.modified_at)}</td>
              </tr>
            ))}
          {!loading && !rows.length && (
            <tr>
              <td colSpan="7" className="empty-cell">
                No records match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Pagination({ page, pageSize, totalRows, totalPages, onPageChange, onPageSizeChange }) {
  const start = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalRows);

  function changePage(nextPage) {
    onPageChange(Math.min(Math.max(nextPage, 1), totalPages));
  }

  return (
    <div className="pagination">
      <div className="pagination-summary">
        Showing {formatNumber(start)}-{formatNumber(end)} of {formatNumber(totalRows)} rows
      </div>
      <div className="pagination-controls">
        <label>
          Rows
          <select
            value={pageSize}
            onChange={(event) => {
              onPageSizeChange(Number(event.target.value));
              onPageChange(1);
            }}
          >
            <option value="250">250</option>
            <option value="500">500</option>
            <option value="1000">1000</option>
            <option value="2500">2500</option>
          </select>
        </label>
        <button className="ghost-button compact" type="button" disabled={page <= 1} onClick={() => changePage(page - 1)}>
          Previous
        </button>
        <span>
          Page {formatNumber(page)} of {formatNumber(totalPages)}
        </span>
        <button
          className="ghost-button compact"
          type="button"
          disabled={page >= totalPages}
          onClick={() => changePage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function UploadPanel({ canUpload, onUpload, loading, progress }) {
  return (
    <section className="panel" id="upload">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Admin upload</p>
          <h2>CSV or Excel import</h2>
        </div>
        {!canUpload && <Lock size={18} />}
      </div>

      <div className={`drop-zone ${!canUpload ? 'disabled' : ''}`}>
        <Upload size={24} />
        <strong>{canUpload ? 'Upload activity file' : 'Upload restricted'}</strong>
        <p>Accepted headers: Document ID, Document Name, Module, Action, Modified By (Id), Date & Time, Details.</p>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          disabled={!canUpload || loading}
          onChange={(event) => onUpload(event.target.files?.[0])}
        />
      </div>

      {progress && (
        <div className="import-progress" role="status" aria-live="polite">
          <div className="progress-copy">
            <strong>{progress.phase}</strong>
            <span>{progress.fileName}</span>
          </div>
          <div className="progress-bar" aria-label="Import progress">
            <span style={{ width: `${Math.min(progress.percent || 0, 100)}%` }} />
          </div>
          <div className="progress-meta">
            <span>{progress.detail}</span>
            {progress.total > 0 && (
              <span>
                {formatNumber(progress.processed)} / {formatNumber(progress.total)}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function MappingPanel({ canEdit, mappings, accountId, onSave }) {
  const [modifiedById, setModifiedById] = useState('');
  const [displayName, setDisplayName] = useState('');
  const accountMappings = mappings.filter((mapping) => mapping.account_id === accountId);

  function submit(event) {
    event.preventDefault();
    onSave({ modified_by_id: modifiedById, display_name: displayName });
    setModifiedById('');
    setDisplayName('');
  }

  return (
    <section className="panel" id="mappings">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Name mapping</p>
          <h2>Modified By IDs</h2>
        </div>
        <Users size={18} />
      </div>

      <form className="mapping-form" onSubmit={submit}>
        <label>
          Modified By ID
          <input
            value={modifiedById}
            onChange={(event) => setModifiedById(event.target.value)}
            placeholder="Example: U102"
            disabled={!canEdit}
            required
          />
        </label>
        <label>
          Username
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Example: Priya Sharma"
            disabled={!canEdit}
            required
          />
        </label>
        <button className="primary-button" type="submit" disabled={!canEdit}>
          <Check size={16} />
          Save mapping
        </button>
      </form>

      <div className="mapping-list">
        {accountMappings.map((mapping) => (
          <div className="mapping-item" key={mapping.id || `${mapping.account_id}-${mapping.modified_by_id}`}>
            <span>{mapping.modified_by_id}</span>
            <strong>{mapping.display_name}</strong>
          </div>
        ))}
        {!accountMappings.length && <p className="muted">No mappings for this account yet.</p>}
      </div>
    </section>
  );
}

function emptyFilters() {
  return {
    documentId: '',
    documentName: '',
    module: '',
    action: '',
    modifiedBy: '',
    from: '',
    to: '',
  };
}

function applyMappings(rows, mappings) {
  return rows.map((row) => ({
    ...row,
    modified_by_name: findMappingName(mappings, row.account_id, row.modified_by_id),
  }));
}

function findMappingName(mappings, accountId, modifiedById) {
  return (
    mappings.find((mapping) => mapping.account_id === accountId && mapping.modified_by_id === modifiedById)?.display_name ||
    modifiedById
  );
}

function filterRows(rows, filters) {
  return rows.filter((row) => {
    const searchable = {
      documentId: row.document_id,
      documentName: row.document_name,
      modifiedBy: `${row.modified_by_id} ${row.modified_by_name}`,
    };

    const textPass = Object.entries(searchable).every(([key, value]) =>
      value.toLowerCase().includes(filters[key].trim().toLowerCase()),
    );
    const modulePass = filters.module ? row.module === filters.module : true;
    const actionPass = filters.action ? row.action === filters.action : true;

    const rowDate = new Date(row.modified_at);
    const fromPass = filters.from ? rowDate >= new Date(`${filters.from}T00:00:00`) : true;
    const toPass = filters.to ? rowDate <= new Date(`${filters.to}T23:59:59`) : true;

    return textPass && modulePass && actionPass && fromPass && toPass;
  });
}

function applyServerFilters(query, filters) {
  let nextQuery = query;

  if (filters.documentId.trim()) {
    nextQuery = nextQuery.ilike('document_id', `%${escapeLike(filters.documentId.trim())}%`);
  }

  if (filters.documentName.trim()) {
    nextQuery = nextQuery.ilike('document_name', `%${escapeLike(filters.documentName.trim())}%`);
  }

  if (filters.module) {
    nextQuery = nextQuery.eq('module', filters.module);
  }

  if (filters.action) {
    nextQuery = nextQuery.eq('action', filters.action);
  }

  if (filters.modifiedBy.trim()) {
    const term = escapeLike(filters.modifiedBy.trim());
    nextQuery = nextQuery.or(`modified_by_id.ilike.%${term}%,modified_by_name.ilike.%${term}%`);
  }

  if (filters.from) {
    nextQuery = nextQuery.gte('modified_at', `${filters.from}T00:00:00`);
  }

  if (filters.to) {
    nextQuery = nextQuery.lte('modified_at', `${filters.to}T23:59:59`);
  }

  return nextQuery;
}

async function loadFilterOptions(accountId) {
  const [modulesResult, actionsResult] = await Promise.all([
    supabase.rpc('get_document_modules', { target_account_id: accountId }),
    supabase.rpc('get_document_actions', { target_account_id: accountId }),
  ]);

  if (modulesResult.error || actionsResult.error) {
    return { modules: [], actions: [] };
  }

  return {
    modules: modulesResult.data || [],
    actions: actionsResult.data || [],
  };
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function getStats(rows) {
  const sorted = [...rows].sort((a, b) => new Date(b.modified_at) - new Date(a.modified_at));
  return {
    total: rows.length,
    modules: new Set(rows.map((row) => row.module)).size,
    people: new Set(rows.map((row) => row.modified_by_name)).size,
    lastActivity: sorted[0] ? formatShortDate(sorted[0].modified_at) : '-',
  };
}

async function insertRowsInBatches({ rows, uploadId, fileName, onProgress }) {
  const totalBatches = Math.ceil(rows.length / INSERT_BATCH_SIZE);
  let imported = 0;

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
    const start = batchIndex * INSERT_BATCH_SIZE;
    const batch = rows.slice(start, start + INSERT_BATCH_SIZE);

    onProgress({
      phase: 'Uploading rows',
      fileName,
      processed: imported,
      total: rows.length,
      percent: Math.round((imported / rows.length) * 100),
      detail: `Uploading batch ${batchIndex + 1} of ${totalBatches}`,
    });

    const { error } = await supabase.from('document_activity').insert(
      batch.map((row) => ({
        account_id: row.account_id,
        upload_id: uploadId,
        document_id: row.document_id,
        document_name: row.document_name,
        module: row.module,
        action: row.action,
        details: row.details,
        modified_by_id: row.modified_by_id,
        modified_at: row.modified_at,
      })),
    );

    if (error) {
      throw new Error(`Batch ${batchIndex + 1} failed after ${formatNumber(imported)} rows: ${error.message}`);
    }

    imported += batch.length;

    onProgress({
      phase: 'Uploading rows',
      fileName,
      processed: imported,
      total: rows.length,
      percent: Math.round((imported / rows.length) * 100),
      detail: `Uploaded batch ${batchIndex + 1} of ${totalBatches}. Inserted ${formatNumber(imported)} rows.`,
    });
  }

  return { imported };
}

async function parseUploadFile(file, onProgress = () => {}) {
  const extension = file.name.split('.').pop().toLowerCase();

  if (extension === 'csv') {
    return new Promise((resolve, reject) => {
      const rows = [];
      let processed = 0;
      const estimatedRows = Math.max(1, Math.round(file.size / 180));

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        step: (result, parser) => {
          try {
            validateHeaders(result.meta.fields || []);
            rows.push(result.data);
            processed += 1;

            if (processed === 1 || processed % 5000 === 0) {
              onProgress({
                processed,
                total: estimatedRows,
                percent: Math.min(95, Math.round((processed / estimatedRows) * 100)),
              });
            }
          } catch (error) {
            parser.abort();
            reject(error);
          }
        },
        complete: () => {
          onProgress({ processed, total: processed, percent: 100 });
          resolve(rows);
        },
        error: reject,
      });
    });
  }

  const sheetRows = await readXlsxFile(file);
  const headers = (sheetRows[0] || []).map((header) => String(header || '').trim());
  validateHeaders(headers);
  onProgress({ processed: sheetRows.length - 1, total: sheetRows.length - 1, percent: 100 });

  return sheetRows.slice(1).map((values) =>
    headers.reduce((record, header, index) => {
      record[header] = values[index] ?? '';
      return record;
    }, {}),
  );
}

function validateHeaders(headers) {
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length) {
    throw new Error(`Missing required headers: ${missing.join(', ')}`);
  }
}

function normalizeUploadRow(row, index, accountId) {
  const modifiedAt = parseUploadDate(row['Date & Time']);

  if (!modifiedAt) {
    console.warn(`Skipping row ${index + 1}: invalid date`);
    return null;
  }

  return {
    account_id: accountId,
    document_id: String(row['Document ID'] || '').trim(),
    document_name: String(row['Document Name'] || '').trim(),
    module: String(row.Module || '').trim(),
    action: String(row.Action || '').trim(),
    details: String(row.Details || '').trim(),
    modified_by_id: String(row['Modified By (Id)'] || '').trim(),
    modified_at: modifiedAt,
  };
}

function escapeLike(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function parseUploadDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === 'number') {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + value * 86400000).toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value || 0);
}

createRoot(document.getElementById('root')).render(<App />);
