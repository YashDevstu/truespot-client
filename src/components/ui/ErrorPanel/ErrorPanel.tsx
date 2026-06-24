'use client'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'

interface ErrorPanelProps {
  message: string
}

export default function ErrorPanel({ message }: ErrorPanelProps) {
  return (
    <Box sx={{ p: 3 }}>
      <Alert severity="error">{message}</Alert>
    </Box>
  )
}
