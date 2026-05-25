import { useI18n } from '@/lib/i18n-context'
import { PRIORITY_CONFIG } from '@/lib/utils'
import type { Priority } from '@/types'

export function usePriorityConfig(): typeof PRIORITY_CONFIG {
  const { t } = useI18n()
  return {
    low:    { ...PRIORITY_CONFIG.low,    label: t('low')    },
    medium: { ...PRIORITY_CONFIG.medium, label: t('medium') },
    high:   { ...PRIORITY_CONFIG.high,   label: t('high')   },
    urgent: { ...PRIORITY_CONFIG.urgent, label: t('urgent') },
  }
}