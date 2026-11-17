"use client";

import { useUIStore } from "@/store/ui-store";
import { useCallback, useEffect, useState } from "react";
import { Bell, Check, Info, X } from "lucide-react";
import { api } from "@/lib/api";

type Notification = {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
};

export function NotificationsPanel() {
  const isOpen = useUIStore((state) => state.isNotificationsPanelOpen);
  const togglePanel = useUIStore((state) => state.toggleNotificationsPanel);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.get<Notification[]>("/notifications");
      setNotifications(data);
    } catch (error) {
      console.error("Failed to fetch notifications", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void fetchNotifications();
    }
  }, [fetchNotifications, isOpen]);

  const markAsRead = async (id: string) => {
    try {
      await api.put(`/notifications/${id}/read`, { is_read: true });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (error) {
      console.error("Failed to mark as read", error);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
        onClick={togglePanel}
      />
      <div className="neo-notifications fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-surface-container-lowest border-l border-outline-variant shadow-2xl flex flex-col transform transition-transform duration-300">
        <div className="flex items-center justify-between p-4 border-b border-outline-variant">
          <div className="flex items-center gap-2 text-on-surface">
            <Bell size={18} />
            <h2 className="text-title-md font-medium">Notifications</h2>
          </div>
          <button 
            onClick={togglePanel}
            className="p-1.5 rounded-md hover:bg-surface-container-high text-on-surface-variant transition-colors"
            aria-label="Close notifications"
          >
            <X size={18} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="text-center text-body-sm text-on-surface-variant py-8">Loading...</div>
          ) : notifications.length === 0 ? (
            <div className="text-center text-body-sm text-on-surface-variant py-8">
              No notifications yet.
            </div>
          ) : (
            notifications.map(notification => (
              <div 
                key={notification.id}
                className={`p-3 rounded-xl border transition-colors ${
                  notification.is_read 
                    ? "bg-surface-container-lowest border-outline-variant opacity-70" 
                    : "bg-surface-container-low border-primary/20"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="text-label-lg font-medium text-on-surface flex items-center gap-2">
                        {notification.type === 'info' && <Info size={14} className="text-secondary" />}
                        {notification.title}
                    </h3>
                    <p className="text-body-sm text-on-surface-variant mt-1">{notification.message}</p>
                    <span className="text-label-sm text-on-surface-variant/70 mt-2 block">
                        {new Date(notification.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {!notification.is_read && (
                    <button 
                      onClick={() => markAsRead(notification.id)}
                      className="p-1.5 rounded-full hover:bg-surface-container-high text-primary"
                      title="Mark as read"
                      aria-label="Mark notification as read"
                    >
                      <Check size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
