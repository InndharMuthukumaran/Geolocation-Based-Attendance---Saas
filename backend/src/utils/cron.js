import cron from 'node-cron';
import AttendanceLog from '../models/AttendanceLog.js';

export const initCronJobs = () => {
  // Run at 23:59 (11:59 PM) every day
  cron.schedule('59 23 * * *', async () => {
    console.log('[CRON] Running Midnight Sweeper to close dangling attendance logs...');
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const result = await AttendanceLog.updateMany(
        {
          date: today,
          checkOutTime: { $exists: false },
        },
        {
          $set: {
            checkOutTime: new Date(), // This will be approx 23:59:00
            checkOutType: 'SYSTEM_FORCED',
          },
        }
      );

      console.log(`[CRON] Sweeper completed. Closed ${result.modifiedCount} logs.`);
    } catch (err) {
      console.error('[CRON] Sweeper error:', err);
    }
  }, {
    scheduled: true,
    timezone: "UTC" // You can change this to your local timezone if needed
  });

  console.log('[CRON] Midnight Sweeper job scheduled.');
};
