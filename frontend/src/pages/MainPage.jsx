import React from 'react';
import {
  Box,
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
  Typography,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DownloadIcon from '@mui/icons-material/Download';
import StopIcon from '@mui/icons-material/Stop';
import HistoryIcon from '@mui/icons-material/History';

export function MainPage({
  file,
  jobId,
  status,
  logs,
  isUploading,
  isPolling,
  pageProgress,
  statusMeta,
  canDownload,
  statusColor,
  onFileChange,
  onUpload,
  onFetchStatus,
  onStartPolling,
  onStopPolling,
  onDownload,
  onJobIdChange,
}) {
  let ttlLabel = null;
  if (statusMeta && typeof statusMeta.expiresAt === 'number') {
    const nowSec = Math.floor(Date.now() / 1000);
    const diffSec = statusMeta.expiresAt - nowSec;
    const days = Math.ceil(diffSec / (24 * 60 * 60));
    if (days < 0) {
      ttlLabel = 'TTL 지남';
    } else if (days === 0) {
      ttlLabel = 'TTL: 오늘까지';
    } else {
      ttlLabel = `TTL: ${days}일 남음`;
    }
  }

  return (
    <Box mt={3}>
      <Stack spacing={3}>
        <Paper elevation={3} sx={{ p: 3, borderRadius: 2, bgcolor: 'background.paper' }}>
          <Stack spacing={2}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Chip label="Main" size="small" color="primary" variant="outlined" />
              <Chip label="PDF Generate" size="small" variant="outlined" />
            </Stack>
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
                  onChange={onFileChange}
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
                onChange={(e) => onJobIdChange(e.target.value)}
                placeholder="업로드 후 생성된 job_id"
                sx={{ flexGrow: 1, maxWidth: 360 }}
              />
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<PlayArrowIcon />}
                  onClick={onUpload}
                  disabled={isUploading || !file}
                >
                  {isUploading ? '업로드 중...' : 'Generate'}
                </Button>
                <Button variant="outlined" onClick={() => onFetchStatus()}>
                  상태 조회
                </Button>
                <Tooltip title={isPolling ? '자동 폴링 중지' : '자동 폴링 시작'}>
                  <span>
                    <IconButton
                      color={isPolling ? 'warning' : 'default'}
                      onClick={isPolling ? onStopPolling : onStartPolling}
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
                      onClick={onDownload}
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
            {statusMeta && (statusMeta.pageCount != null || ttlLabel || statusMeta.errorCode) && (
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                {statusMeta.pageCount != null && (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`총 ${statusMeta.pageCount}페이지`}
                  />
                )}
                {ttlLabel && (
                  <Chip size="small" variant="outlined" label={ttlLabel} />
                )}
                {statusMeta.errorCode && (
                  <Chip
                    size="small"
                    color="error"
                    variant="outlined"
                    label={`에러: ${statusMeta.errorCode}`}
                  />
                )}
              </Stack>
            )}
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
  );
}
