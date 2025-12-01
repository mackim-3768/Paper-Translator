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
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import HistoryIcon from '@mui/icons-material/History';
import DescriptionIcon from '@mui/icons-material/Description';

export function DashboardPage({ search, onSearchChange, jobs, onOpenJob, onRefreshJob }) {
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
          <Divider />
          {jobs.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              아직 기록된 Job이 없습니다. Main 탭에서 번역을 수행하면 이곳에 표시됩니다.
            </Typography>
          ) : (
            <List dense sx={{ maxHeight: 360, overflow: 'auto' }}>
              {jobs.map((job) => (
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
                          상태: {job.lastStatus || '알 수 없음'} · 생성:{' '}
                          {job.createdAt ? new Date(job.createdAt).toLocaleString() : '-'}
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
  );
}
