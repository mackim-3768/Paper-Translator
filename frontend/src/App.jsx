import React, { useEffect, useMemo, useState } from 'react';
import {
  AppBar,
  Box,
  Toolbar,
  Typography,
  Container,
  Chip,
  List,
  ListItemButton,
  ListItemText,
  ListSubheader,
  Divider,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import DescriptionIcon from '@mui/icons-material/Description';
import { MainPage } from './pages/MainPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';

export default function App() {
  const [tab, setTab] = useState(0);
  const [file, setFile] = useState(null);
  const [jobId, setJobId] = useState('');
  const [status, setStatus] = useState('대기 중');
  const [logs, setLogs] = useState(['UI 초기화 완료.']);
  const [isUploading, setIsUploading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [pageProgress, setPageProgress] = useState(null);
  const [jobHistory, setJobHistory] = useState([]);
  const [search, setSearch] = useState('');

  const canDownload = useMemo(() => status === 'COMPLETED', [status]);

  const appendLog = (msg) => {
    const ts = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${ts}] ${msg}`]);
  };

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs');
      if (!res.ok) {
        throw new Error('Job 목록 조회 실패');
      }
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      setJobHistory(items);
    } catch (err) {
      console.error(err);
      appendLog(`Job 목록 조회 오류: ${err.message || String(err)}`);
    }
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
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
      setPageProgress(null);
      appendLog(`업로드 완료, job_id=${newJobId}`);
      appendLog('자동 상태 폴링을 시작합니다.');
      setIsPolling(true);
      fetchJobs();
    } catch (err) {
      console.error(err);
      appendLog(`업로드 오류: ${err.message || String(err)}`);
      setStatus('ERROR');
      alert(err.message || '업로드 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
    }
  };

  const fetchStatus = async (overrideJobId) => {
    const id = (overrideJobId ?? jobId).trim();
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

      const processedPages = data.processed_pages ?? data.processedPages ?? null;
      const totalPages = data.total_pages ?? data.totalPages ?? null;
      const rawProgress = data.progress ?? null;
      let progressPercent = null;
      if (typeof rawProgress === 'number') {
        progressPercent = Math.round(rawProgress * 100);
      } else if (processedPages != null && totalPages) {
        progressPercent = Math.round((processedPages / totalPages) * 100);
      }
      if (processedPages != null || totalPages != null || progressPercent != null) {
        setPageProgress({
          processedPages,
          totalPages,
          progressPercent,
        });
      }

      appendLog(`상태: ${JSON.stringify(data)}`);
      fetchJobs();
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

  const stopPolling = () => {
    if (isPolling) {
      appendLog('사용자에 의해 자동 폴링 중지');
    }
    setIsPolling(false);
  };

  const statusColor =
    status === 'COMPLETED'
      ? 'success'
      : status === 'FAILED' || status === 'ERROR'
      ? 'error'
      : status === 'RUNNING' || status === 'PENDING' || status === '업로드 중'
      ? 'info'
      : 'default';

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobHistory;
    return jobHistory.filter((job) => {
      return (
        job.jobId.toLowerCase().includes(q) ||
        (job.fileName && job.fileName.toLowerCase().includes(q)) ||
        (job.lastStatus && job.lastStatus.toLowerCase().includes(q))
      );
    });
  }, [jobHistory, search]);

  useEffect(() => {
    fetchJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recentJobs = jobHistory.slice(0, 10);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        color: 'text.primary',
        display: 'flex',
      }}
    >
      <Box
        component="nav"
        sx={{
          width: 260,
          flexShrink: 0,
          borderRight: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          p: 2,
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <DescriptionIcon fontSize="small" />
          <Typography variant="subtitle1">Paper Translator</Typography>
        </Box>
        <Chip icon={<HistoryIcon />} label="v1.0.0" size="small" variant="outlined" sx={{ mb: 1 }} />

        <List
          dense
          subheader={
            <ListSubheader component="div" disableSticky sx={{ bgcolor: 'transparent', px: 0 }}>
              페이지
            </ListSubheader>
          }
          sx={{ px: 0 }}
        >
          <ListItemButton selected={tab === 0} onClick={() => setTab(0)}>
            <ListItemText primary="Main" />
          </ListItemButton>
          <ListItemButton selected={tab === 1} onClick={() => setTab(1)}>
            <ListItemText primary="Dashboard" />
          </ListItemButton>
        </List>

        <Divider sx={{ my: 1 }} />

        <List
          dense
          subheader={
            <ListSubheader component="div" disableSticky sx={{ bgcolor: 'transparent', px: 0 }}>
              최근 Job
            </ListSubheader>
          }
          sx={{ px: 0, flexGrow: 1, overflow: 'auto' }}
        >
          {recentJobs.length === 0 && (
            <ListItemText
              primary="기록 없음"
              primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
              sx={{ px: 2, py: 1 }}
            />
          )}
          {recentJobs.map((job) => (
            <ListItemButton
              key={job.jobId}
              onClick={() => {
                setJobId(job.jobId);
                setTab(0);
                appendLog(`Sidebar에서 job_id=${job.jobId} 선택`);
              }}
            >
              <ListItemText
                primary={job.fileName || job.jobId}
                secondary={job.lastStatus || '상태 알 수 없음'}
                primaryTypographyProps={{ noWrap: true }}
                secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
              />
            </ListItemButton>
          ))}
        </List>
      </Box>

      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <AppBar position="static" color="transparent" elevation={0}>
          <Toolbar>
            <DescriptionIcon sx={{ mr: 1 }} />
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h6" component="div">
                Paper Translator
              </Typography>
              <Typography variant="body2" color="text.secondary">
                고품질 레이아웃 보존 영→한 논문 번역
              </Typography>
            </Box>
            <Chip icon={<HistoryIcon />} label="v1.0.0" variant="outlined" size="small" />
          </Toolbar>
        </AppBar>

        <Container maxWidth="lg" sx={{ pt: 3, pb: 4 }}>
          {tab === 0 && (
            <MainPage
              file={file}
              jobId={jobId}
              status={status}
              logs={logs}
              isUploading={isUploading}
              isPolling={isPolling}
              pageProgress={pageProgress}
              canDownload={canDownload}
              statusColor={statusColor}
              onFileChange={handleFileChange}
              onUpload={handleUpload}
              onFetchStatus={fetchStatus}
              onStartPolling={() => setIsPolling(true)}
              onStopPolling={stopPolling}
              onDownload={() => {
                const id = jobId.trim();
                if (!id) {
                  alert('job_id를 입력해주세요.');
                  return;
                }
                const url = `/api/download/${encodeURIComponent(id)}`;
                appendLog(`다운로드 요청: ${url}`);
                window.open(url, '_blank');
              }}
              onJobIdChange={setJobId}
            />
          )}

          {tab === 1 && (
            <DashboardPage
              search={search}
              onSearchChange={setSearch}
              jobs={filteredJobs}
              onOpenJob={(job) => {
                setJobId(job.jobId);
                setTab(0);
                appendLog(`Dashboard에서 job_id=${job.jobId} 선택`);
              }}
              onRefreshJob={(job) => {
                setJobId(job.jobId);
                setTab(0);
                fetchStatus(job.jobId);
              }}
            />
          )}
        </Container>
      </Box>
    </Box>
  );
}
