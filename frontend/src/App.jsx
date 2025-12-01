import React, { useEffect, useMemo, useState } from 'react';
import {
  AppBar,
  Box,
  Toolbar,
  Typography,
  Tabs,
  Tab,
  Container,
  Paper,
  Button,
  TextField,
  Stack,
  Chip,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Tooltip,
  Divider,
  InputAdornment,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DownloadIcon from '@mui/icons-material/Download';
import StopIcon from '@mui/icons-material/Stop';
import SearchIcon from '@mui/icons-material/Search';
import HistoryIcon from '@mui/icons-material/History';
import DescriptionIcon from '@mui/icons-material/Description';

const LOCAL_STORAGE_KEY = 'paper-translator-jobs';

function loadJobHistory() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveJobHistory(list) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export default function App() {
  const [tab, setTab] = useState(0);
  const [file, setFile] = useState(null);
  const [jobId, setJobId] = useState('');
  const [status, setStatus] = useState('대기 중');
  const [logs, setLogs] = useState(['UI 초기화 완료.']);
  const [isUploading, setIsUploading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [pageProgress, setPageProgress] = useState(null);
  const [jobHistory, setJobHistory] = useState(() => loadJobHistory());
  const [search, setSearch] = useState('');

  const canDownload = useMemo(() => status === 'COMPLETED', [status]);

  const appendLog = (msg) => {
    const ts = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${ts}] ${msg}`]);
  };

  const updateJobHistory = (id, updater) => {
    if (!id) return;
    setJobHistory((prev) => {
      const now = Date.now();
      const next = [...prev];
      const index = next.findIndex((j) => j.jobId === id);
      const base = index >= 0 ? next[index] : { jobId: id, createdAt: now };
      const updated = {
        ...base,
        ...updater,
        lastUpdatedAt: updater.lastUpdatedAt ?? now,
      };
      if (index >= 0) {
        next[index] = updated;
      } else {
        next.unshift(updated);
      }
      saveJobHistory(next);
      return next;
    });
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
      updateJobHistory(newJobId, { fileName: file.name, lastStatus: 'PENDING' });
      appendLog(`업로드 완료, job_id=${newJobId}`);
      appendLog('자동 상태 폴링을 시작합니다.');
      setIsPolling(true);
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
      updateJobHistory(id, { lastStatus: s });
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

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary' }}>
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
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tab} onChange={(_, value) => setTab(value)} aria-label="메인/대시보드 탭">
            <Tab label="Main" />
            <Tab label="Dashboard" />
          </Tabs>
        </Box>

        {tab === 0 && (
          <Box mt={3}>
            <Stack spacing={3}>
              <Paper elevation={3} sx={{ p: 3, borderRadius: 2, bgcolor: 'background.paper' }}>
                <Stack spacing={2}>
                  <Typography variant="h6">PDF Generate</Typography>
                  <Typography variant="body2" color="text.secondary">
                    논문 PDF를 업로드하면 백그라운드에서 번역이 진행되고, 완료되면 번역본을 다운로드할 수 있습니다.
                  </Typography>
                  <Divider />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                    <Button
                      variant="outlined"
                      component="label"
                      startIcon={<CloudUploadIcon />}
                      color="primary"
                    >
                      PDF 선택
                      <input
                        hidden
                        type="file"
                        accept="application/pdf"
                        onChange={handleFileChange}
                      />
                    </Button>
                    <Typography
                      variant="body2"
                      color={file ? 'text.primary' : 'text.secondary'}
                      noWrap
                    >
                      {file ? file.name : '선택된 파일이 없습니다.'}
                    </Typography>
                  </Stack>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={2}
                    alignItems={{ xs: 'stretch', sm: 'center' }}
                  >
                    <TextField
                      label="job_id"
                      size="small"
                      value={jobId}
                      onChange={(e) => setJobId(e.target.value)}
                      placeholder="업로드 후 생성된 job_id"
                      sx={{ flexGrow: 1, maxWidth: 360 }}
                    />
                    <Stack direction="row" spacing={1}>
                      <Button
                        variant="contained"
                        color="primary"
                        startIcon={<PlayArrowIcon />}
                        onClick={handleUpload}
                        disabled={isUploading || !file}
                      >
                        {isUploading ? '업로드 중...' : 'Generate'}
                      </Button>
                      <Button variant="outlined" onClick={() => fetchStatus()}>
                        상태 조회
                      </Button>
                      <Tooltip title={isPolling ? '자동 폴링 중지' : '자동 폴링 시작'}>
                        <span>
                          <IconButton
                            color={isPolling ? 'warning' : 'default'}
                            onClick={isPolling ? stopPolling : () => setIsPolling(true)}
                            disabled={!jobId.trim()}
                          >
                            {isPolling ? <StopIcon /> : <HistoryIcon />}
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip
                        title={canDownload ? '번역본 다운로드' : '번역이 완료되면 활성화됩니다'}
                      >
                        <span>
                          <IconButton
                            color="success"
                            onClick={() => {
                              const id = jobId.trim();
                              if (!id) {
                                alert('job_id를 입력해주세요.');
                                return;
                              }
                              const url = `/api/download/${encodeURIComponent(id)}`;
                              appendLog(`다운로드 요청: ${url}`);
                              window.open(url, '_blank');
                            }}
                            disabled={!canDownload}
                          >
                            <DownloadIcon />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </Stack>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" color="text.secondary">
                      상태:
                    </Typography>
                    <Chip size="small" label={status} color={statusColor} />
                    {isPolling && (
                      <Typography variant="caption" color="text.secondary">
                        자동 폴링 중...
                      </Typography>
                    )}
                  </Stack>
                  {pageProgress && (
                    <Box mt={1}>
                      <Stack spacing={0.5}>
                        <Stack direction="row" justifyContent="space-between">
                          <Typography variant="body2">페이지 진행 상황</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {pageProgress.processedPages != null && pageProgress.totalPages != null
                              ? `${pageProgress.processedPages} / ${pageProgress.totalPages} 페이지`
                              : pageProgress.progressPercent != null
                              ? `${pageProgress.progressPercent}%`
                              : null}
                          </Typography>
                        </Stack>
                        <LinearProgress
                          variant={
                            pageProgress.progressPercent != null ? 'determinate' : 'indeterminate'
                          }
                          value={pageProgress.progressPercent ?? 0}
                        />
                      </Stack>
                    </Box>
                  )}
                </Stack>
              </Paper>

              <Paper elevation={3} sx={{ p: 3, borderRadius: 2, bgcolor: 'background.paper' }}>
                <Stack spacing={1.5}>
                  <Typography variant="h6">로그</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Generate 요청부터 상태 조회, 다운로드까지의 이벤트를 시간 순으로 표시합니다.
                  </Typography>
                  <Divider />
                  <Box
                    sx={{
                      maxHeight: 280,
                      overflow: 'auto',
                      bgcolor: 'background.default',
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <List dense sx={{ py: 0 }}>
                      {logs.map((log, idx) => (
                        <ListItem key={idx} disablePadding sx={{ px: 1.5, py: 0.5 }}>
                          <ListItemText
                            primary={log}
                            primaryTypographyProps={{
                              variant: 'body2',
                              sx: { fontFamily: 'monospace' },
                            }}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Box>
                </Stack>
              </Paper>
            </Stack>
          </Box>
        )}

        {tab === 1 && (
          <Box mt={3}>
            <Paper elevation={3} sx={{ p: 3, borderRadius: 2, bgcolor: 'background.paper' }}>
              <Stack spacing={2}>
                <Typography variant="h6">Dashboard</Typography>
                <Typography variant="body2" color="text.secondary">
                  이 브라우저에서 진행한 번역 Job들을 로컬 스토리지 기준으로 보여줍니다. 검색을 통해
                  job_id, 파일명, 상태로 필터링할 수 있습니다.
                </Typography>
                <TextField
                  size="small"
                  placeholder="job_id / 파일명 / 상태 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
                <Divider />
                {filteredJobs.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    아직 기록된 Job이 없습니다. Main 탭에서 번역을 수행하면 이곳에 표시됩니다.
                  </Typography>
                ) : (
                  <List dense sx={{ maxHeight: 360, overflow: 'auto' }}>
                    {filteredJobs.map((job) => (
                      <ListItem
                        key={job.jobId}
                        secondaryAction={
                          <Stack direction="row" spacing={1}>
                            <Tooltip title="Main에서 열기">
                              <IconButton
                                edge="end"
                                onClick={() => {
                                  setJobId(job.jobId);
                                  setTab(0);
                                  appendLog(`Dashboard에서 job_id=${job.jobId} 선택`);
                                }}
                              >
                                <DescriptionIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="상태 새로고침">
                              <IconButton
                                edge="end"
                                onClick={() => {
                                  setJobId(job.jobId);
                                  setTab(0);
                                  fetchStatus(job.jobId);
                                }}
                              >
                                <HistoryIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        }
                      >
                        <ListItemText
                          primary={
                            <Typography variant="body2" noWrap>
                              {job.jobId}
                            </Typography>
                          }
                          secondary={
                            <Stack spacing={0.25}>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                noWrap
                              >
                                {job.fileName || '(파일명 없음)'}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" noWrap>
                                상태: {job.lastStatus || '알 수 없음'} · 생성:{' '}
                                {job.createdAt
                                  ? new Date(job.createdAt).toLocaleString()
                                  : '-'}
                              </Typography>
                            </Stack>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
              </Stack>
            </Paper>
          </Box>
        )}
      </Container>
    </Box>
  );
}
