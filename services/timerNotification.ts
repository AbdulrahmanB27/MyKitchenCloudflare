import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

// Safe integer ID converter from string
export const hashStringToId = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash) % 2000000000;
};

const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

let channelCreated = false;

/**
 * Initialize Android notification channel for timers
 */
export const initTimerNotificationChannel = async () => {
    if (Capacitor.isNativePlatform() && !channelCreated) {
        try {
            await LocalNotifications.createChannel({
                id: 'kitchen-timers',
                name: 'Cooking Timers',
                description: 'Persistent notification for active cooking timers',
                importance: 5, // High importance
                visibility: 1, // Public
                vibration: true,
                sound: 'beep.wav'
            });
            channelCreated = true;
        } catch (e) {
            console.warn('Failed to create notification channel:', e);
        }
    }
};

/**
 * Request notification permissions on Mobile and Web
 */
export const requestTimerNotificationPermission = async (): Promise<boolean> => {
    try {
        if (Capacitor.isNativePlatform()) {
            await initTimerNotificationChannel();
            const perm = await LocalNotifications.checkPermissions();
            if (perm.display !== 'granted') {
                const req = await LocalNotifications.requestPermissions();
                return req.display === 'granted';
            }
            return true;
        } else if (typeof window !== 'undefined' && 'Notification' in window) {
            if (Notification.permission === 'granted') return true;
            if (Notification.permission !== 'denied') {
                const res = await Notification.requestPermission();
                return res === 'granted';
            }
        }
    } catch (e) {
        console.warn('Error requesting notification permission:', e);
    }
    return false;
};

// Store active web notifications for fallback
const activeWebNotifications: Record<string, Notification> = {};
const scheduledWebTimeouts: Record<string, number> = {};

/**
 * Sync active timer with system notifications (Capacitor Native / Web)
 * Displays ongoing countdown in notification bar + schedules completion alert.
 */
export const syncTimerNotification = async (params: {
    timerId: string;
    recipeTitle?: string;
    stepName?: string;
    remainingSeconds: number;
    totalSeconds?: number;
    isRunning: boolean;
}) => {
    const { timerId, recipeTitle = 'MyKitchen Timer', stepName, remainingSeconds, isRunning } = params;
    const numId = hashStringToId(timerId);
    const completionId = numId + 1000000;

    // If timer stopped or finished, cancel notifications
    if (!isRunning || remainingSeconds <= 0) {
        await cancelTimerNotification(timerId);
        return;
    }

    const timeStr = formatTime(remainingSeconds);
    const titleText = `⏱️ ${timeStr} - ${recipeTitle}`;
    const bodyText = stepName ? `Step: ${stepName}` : `Active cooking timer (${timeStr} left)`;

    if (Capacitor.isNativePlatform()) {
        try {
            await initTimerNotificationChannel();
            
            // 1. Update persistent ongoing notification for Android & iOS Lock Screen
            await LocalNotifications.schedule({
                notifications: [
                    {
                        id: numId,
                        title: titleText,
                        body: bodyText,
                        channelId: 'kitchen-timers',
                        ongoing: true, // Android persistent notification
                        autoCancel: false,
                        extra: { timerId, remainingSeconds }
                    }
                ]
            });

            // 2. Schedule completion alert at target exact timestamp so it rings even if app is backgrounded/closed
            const targetTime = new Date(Date.now() + remainingSeconds * 1000);
            await LocalNotifications.schedule({
                notifications: [
                    {
                        id: completionId,
                        title: `🔔 Timer Done! (${recipeTitle})`,
                        body: stepName ? `Step completed: ${stepName}` : 'Your cooking timer has finished!',
                        channelId: 'kitchen-timers',
                        schedule: { at: targetTime },
                        sound: 'beep.wav',
                        actionTypeId: 'TIMER_FINISHED',
                        extra: { timerId, completed: true }
                    }
                ]
            });
        } catch (e) {
            console.warn('Capacitor LocalNotification error:', e);
        }
    } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
            // Update Web Notification (with tag so it replaces previous notification without stacking)
            const notif = new Notification(titleText, {
                body: bodyText,
                tag: `timer-${timerId}`,
                silent: true
            });
            activeWebNotifications[timerId] = notif;

            // Clear old scheduled web completion timeout
            if (scheduledWebTimeouts[timerId]) {
                window.clearTimeout(scheduledWebTimeouts[timerId]);
            }

            // Schedule web completion alert
            scheduledWebTimeouts[timerId] = window.setTimeout(() => {
                if (navigator.vibrate) {
                    navigator.vibrate([300, 150, 300, 150, 500]);
                }
                new Notification(`🔔 Timer Finished!`, {
                    body: `${recipeTitle} - ${stepName || 'Step completed!'}`,
                    tag: `timer-finish-${timerId}`,
                    requireInteraction: true
                });
            }, remainingSeconds * 1000);
        } catch (e) {
            console.warn('Web notification error:', e);
        }
    }
};

/**
 * Cancel timer notification and any scheduled completion alarm
 */
export const cancelTimerNotification = async (timerId: string) => {
    const numId = hashStringToId(timerId);
    const completionId = numId + 1000000;

    if (Capacitor.isNativePlatform()) {
        try {
            await LocalNotifications.cancel({
                notifications: [{ id: numId }, { id: completionId }]
            });
        } catch (e) {
            console.warn('Capacitor cancel error:', e);
        }
    }

    if (activeWebNotifications[timerId]) {
        try {
            activeWebNotifications[timerId].close();
        } catch (e) {}
        delete activeWebNotifications[timerId];
    }

    if (scheduledWebTimeouts[timerId]) {
        window.clearTimeout(scheduledWebTimeouts[timerId]);
        delete scheduledWebTimeouts[timerId];
    }
};

/**
 * Send an immediate alert notification on timer completion
 */
export const notifyTimerFinished = async (recipeTitle: string, stepName?: string) => {
    if (Capacitor.isNativePlatform()) {
        try {
            await LocalNotifications.schedule({
                notifications: [
                    {
                        id: Math.floor(Math.random() * 1000000),
                        title: `🔔 Timer Done!`,
                        body: `${recipeTitle}${stepName ? `: ${stepName}` : ''}`,
                        channelId: 'kitchen-timers',
                        sound: 'beep.wav'
                    }
                ]
            });
        } catch (e) {}
    } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(`🔔 Timer Finished!`, {
            body: `${recipeTitle}${stepName ? `: ${stepName}` : ''}`,
            requireInteraction: true
        });
    }

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([300, 150, 300, 150, 500]);
    }
};
