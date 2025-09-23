import * as dayjs from 'dayjs';

/**
 * Format thời gian về string
 * @param date Ngày cần format (Date | string | number)
 * @param format Định dạng (default: "YYYY-MM-DD HH:mm:ss")
 * @param tz Timezone (default: "Asia/Ho_Chi_Minh")
 */
export function formatTime(
  date: Date | string | number,
  format: string = 'YYYY-MM-DD HH:mm:ss',
): string {
  return dayjs(date).format(format);
}
