import React, { useEffect, useMemo, useState } from 'react';

function cls(...names) {
  return names.filter(Boolean).join(' ');
}

export default function App() {
  const [file, setFile] = useState(null);
  const [jobId, setJobId] = useState('');
  const [status, setStatus] = useState('대기 중');
  const [logs, setLogs] = useState(['UI 초기화 완료.']);
  const [isUploading, setIsUploading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  const canDownload = useMemo(() => status === 'COMPLETED', [status]);

  const appendLog = (msg) => {
    const ts = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${ts}] ${msg}`]);
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    setFile(f ?? null);
    if (f) {
      appendLog(`파일 선택: ${f.name}`);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      alert('먼저 PDF 파일을 선택해주세요.');
      return;
    }
    setIsUploading(true);
    setStatus('업로드 중');
    appendLog(`업로드 시작: ${file.name}`);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      if (!res.ok) {
        let detail = '업로드 실패';
        try {
          const data = await res.json();
          detail = data.detail || detail;
        } catch {
          // ignore
        }
        throw new Error(detail);
      }
      const data = await res.json();
      const newJobId = data.job_id || data.jobId;
      if (!newJobId) {
        throw new Error('응답에 job_id가 없습니다.');
      }
      setJobId(newJobId);
      setStatus('PENDING');
      appendLog(`업로드 완료, job_id=${newJobId}`);
    } catch (err) {
      console.error(err);
      appendLog(`업로드 오류: ${err.message || String(err)}`);
      setStatus('ERROR');
      alert(err.message || '업로드 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
    }
  };

  const fetchStatus = async () => {
    const id = jobId.trim();
    if (!id) {
      alert('job_id를 입력해주세요.');
      return null;
    }
    try {
      const res = await fetch(`/api/status/${encodeURIComponent(id)}`);
      if (!res.ok) {
        let detail = '상태 조회 실패';
        try {
          const data = await res.json();
          detail = data.detail || detail;
        } catch {
          // ignore
        }
        throw new Error(detail);
      }
      const data = await res.json();
      const s = data.status || data.job_status || 'UNKNOWN';
      setStatus(s);
      appendLog(`상태: ${JSON.stringify(data)}`);
      return s;
    } catch (err) {
      console.error(err);
      appendLog(`상태 조회 오류: ${err.message || String(err)}`);
      setStatus('ERROR');
      alert(err.message || '상태 조회 중 오류가 발생했습니다.');
      return null;
    }
  };

  useEffect(() => {
    if (!isPolling) return;
    const id = jobId.trim();
    if (!id) return;

    appendLog('자동 폴링 시작 (3초 간격)');
    const timer = setInterval(async () => {
      const s = await fetchStatus();
      if (s === 'COMPLETED' || s === 'FAILED') {
        clearInterval(timer);
        setIsPolling(false);
        appendLog('자동 폴링 종료');
      }
    }, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPolling]);

  const togglePolling = () => {
    if (!jobId.trim()) {
      alert('job_id를 입력해주세요.');
      return;
    }
    setIsPolling((prev) => !prev);
  };

  const handleDownload = () => {
    const id = jobId.trim();
    if (!id) {
      alert('job_id를 입력해주세요.');
      return;
    }
    const url = `/api/download/${encodeURIComponent(id)}`;
    appendLog(`다운로드 요청: ${url}`);
    window.open(url, '_blank');
  };

  const statusClass = status === 'COMPLETED' ? 'ok' : status === 'FAILED' || status === 'ERROR' ? 'bad' : '';

  return (
    <div className="page">
      <header>
        <h1>Paper Translator</h1>
        <p className="desc">영어 논문 PDF를 업로드하면, 백그라운드에서 번역이 진행되고 완료 후 번역본 PDF를 다운로드할 수 있습니다.</p>
      </header>

      <section className="card">
        <h2>1. PDF 업로드</h2>
        <label className="block-label" htmlFor="file">
          논문 PDF 선택
        </label>
        <input id="file" type="file" accept="application/pdf" onChange={handleFileChange} />
        <div className="row">
          <button className="btn primary" onClick={handleUpload} disabled={isUploading}>
            {isUploading ? '업로드 중...' : '업로드 & 번역 시작'}
          </button>
          <span className="hint">업로드 후 job_id가 생성됩니다.</span>
        </div>
      </section>

      <section className="card">
        <h2>2. 상태 조회 &amp; 다운로드</h2>
        <label className="block-label" htmlFor="jobIdInput">
          job_id
        </label>
        <input
          id="jobIdInput"
          type="text"
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          placeholder="업로드 후 나온 job_id"
        />
        <div className="row">
          <button className="btn secondary" onClick={fetchStatus}>
            상태 조회
          </button>
          <button className="btn secondary" onClick={togglePolling} disabled={!jobId.trim()}>
            {isPolling ? '자동 폴링 중지' : '자동 폴링 시작'}
          </button>
          <button className="btn secondary" onClick={handleDownload} disabled={!canDownload}>
            번역본 다운로드
          </button>
          <span className={cls('pill', statusClass)}>{status}</span>
        </div>
      </section>

      <section className="card">
        <h2>로그</h2>
        <pre className="log">
          {logs.map((l, idx) => (
            <div key={idx}>{l}</div>
          ))}
        </pre>
      </section>
    </div>
  );
}
