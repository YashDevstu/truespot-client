'use client'
import { useState } from 'react'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import CircularProgress from '@mui/material/CircularProgress'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import TableChartIcon from '@mui/icons-material/TableChart'

interface ExportButtonProps {
  onExportPdf: () => Promise<void>
  onExportExcel: () => Promise<void>
  disabled?: boolean
}

export default function ExportButton({ onExportPdf, onExportExcel, disabled }: ExportButtonProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [loading, setLoading] = useState<'pdf' | 'excel' | null>(null)

  const open = Boolean(anchorEl)

  const handleOpen = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!loading) setAnchorEl(e.currentTarget)
  }
  const handleClose = () => setAnchorEl(null)

  const run = async (type: 'pdf' | 'excel', handler: () => Promise<void>) => {
    handleClose()
    setLoading(type)
    // Yield one frame so the spinner renders before synchronous generation blocks the thread
    await new Promise<void>((resolve) => setTimeout(resolve, 16))
    try {
      await handler()
    } finally {
      setLoading(null)
    }
  }

  const isLoading = !!loading

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        onClick={handleOpen}
        disabled={disabled || isLoading}
        startIcon={
          isLoading
            ? <CircularProgress size={13} color="inherit" />
            : <FileDownloadIcon fontSize="small" />
        }
        endIcon={<ArrowDropDownIcon fontSize="small" />}
        sx={{
          textTransform: 'none',
          fontWeight: 600,
          fontSize: 13,
          borderColor: 'divider',
          color: 'text.primary',
          px: 1.5,
          '&:hover': { borderColor: 'primary.main', color: 'primary.main', bgcolor: 'transparent' },
          '& .MuiButton-endIcon': { ml: 0.25 },
        }}
      >
        {loading === 'pdf'
          ? 'Generating…'
          : loading === 'excel'
          ? 'Building…'
          : 'Export'}
      </Button>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        slotProps={{ paper: { sx: { minWidth: 170, mt: 0.5, boxShadow: 3 } } }}
      >
        <MenuItem onClick={() => run('pdf', onExportPdf)} dense>
          <ListItemIcon>
            <PictureAsPdfIcon fontSize="small" sx={{ color: '#e53935' }} />
          </ListItemIcon>
          <ListItemText
            primary="Download PDF"
            slotProps={{ primary: { sx: { fontSize: 13, fontWeight: 500 } } }}
          />
        </MenuItem>
        <MenuItem onClick={() => run('excel', onExportExcel)} dense>
          <ListItemIcon>
            <TableChartIcon fontSize="small" sx={{ color: '#2e7d32' }} />
          </ListItemIcon>
          <ListItemText
            primary="Download Excel"
            slotProps={{ primary: { sx: { fontSize: 13, fontWeight: 500 } } }}
          />
        </MenuItem>
      </Menu>
    </>
  )
}
