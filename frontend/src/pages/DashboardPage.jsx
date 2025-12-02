import React from 'react';
import {
  Box,
  Paper,
  Stack,
  Typography,
  TextField,
  Divider,
  List,
  ListItem,
  ListItemText,
  IconButton,
  InputAdornment,
  Tooltip,
  Chip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import HistoryIcon from '@mui/icons-material/History';
import DescriptionIcon from '@mui/icons-material/Description';

export function DashboardPage({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  jobs,
  onOpenJob,
  onRefreshJob,
}) {
  return (
    <Box mt={3}>
      <Paper elevation={3} sx={{ p: 3, borderRadius: 2, bgcolor: 'background.paper' }}>
        <Stack spacing={2}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <DescriptionIcon fontSize="small" />
            <Typography variant="h6">Dashboard</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            이 브라우저에서 진행한 번역 Job들을 로컬 스토리지 기준으로 보여줍니다. 검색을 통해 job_id,
            파일명, 상태로 필터링할 수 있습니다.
          </Typography>
          <TextField
            size="small"
            placeholder="job_id / 파일명 / 상태 검색"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <Stack direction="row" spacing={1}>
            <Chip
              label="전체"
              size="small"
              variant={statusFilter === 'all' ? 'filled' : 'outlined'}
              color={statusFilter === 'all' ? 'primary' : 'default'}
              onClick={() => onStatusFilterChange('all')}
            />
            <Chip
              label="진행/완료"
              size="small"
              variant={statusFilter === 'active' ? 'filled' : 'outlined'}
              color={statusFilter === 'active' ? 'primary' : 'default'}
              onClick={() => onStatusFilterChange('active')}
            />
            <Chip
              label="만료됨"
              size="small"
              variant={statusFilter === 'expired' ? 'filled' : 'outlined'}
              color={statusFilter === 'expired' ? 'primary' : 'default'}
              onClick={() => onStatusFilterChange('expired')}
            />
          </Stack>
          <Divider />
          {jobs.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              아직 기록된 Job이 없습니다. Main 탭에서 번역을 수행하면 이곳에 표시됩니다.
            </Typography>
          ) : (
            <List dense sx={{ maxHeight: 360, overflow: 'auto' }}>
              {jobs.map((job) => {
                const now = Date.now();
                const isExpired =
                  typeof job.expiresAt === 'number' && job.expiresAt * 1000 <= now;
                let ttlLabel = null;
                if (typeof job.expiresAt === 'number') {
                  const nowSec = Math.floor(now / 1000);
                  const diffSec = job.expiresAt - nowSec;
                  const days = Math.ceil(diffSec / (24 * 60 * 60));
                  if (days < 0) {
                    ttlLabel = 'TTL 지남';
                  } else if (days === 0) {
                    ttlLabel = 'TTL: 오늘까지';
                  } else {
                    ttlLabel = `TTL: ${days}일 남음`;
                  }
                }
                const statusLabel = job.lastStatus || '알 수 없음';
                const createdLabel = job.createdAt
                  ? new Date(job.createdAt).toLocaleString()
                  : '-';

                return (
                  <ListItem
                    key={job.jobId}
                    secondaryAction={
                      <Stack direction="row" spacing={1}>
                        <Tooltip title="Main에서 열기">
                          <IconButton edge="end" onClick={() => onOpenJob(job)}>
                            <DescriptionIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="상태 새로고침">
                          <IconButton edge="end" onClick={() => onRefreshJob(job)}>
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
                          <Typography variant="body2" color="text.secondary" noWrap>
                            {job.fileName || '(파일명 없음)'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {`상태: ${statusLabel}${isExpired ? ' (만료됨)' : ''} · 생성: ${createdLabel}`}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {`총 페이지: ${
                              job.pageCount != null ? job.pageCount : '-'
                            }${ttlLabel ? ` · ${ttlLabel}` : ''}${
                              job.errorCode ? ` · 에러: ${job.errorCode}` : ''
                            }`}
                          </Typography>
                        </Stack>
                      }
                    />
                  </ListItem>
                );
              })}
            </List>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}
