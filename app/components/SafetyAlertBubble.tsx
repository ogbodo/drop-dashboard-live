"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The floating safety-alert bubble.
 *
 * Nothing in Drop messages an emergency contact automatically — by decision. An
 * SOS lands here and a person decides whether to call the police, the contact,
 * both or neither. That is kinder than frightening a relative over a
 * pocket-press, and the operator can see whether the car is even moving.
 *
 * It also means THIS IS THE ONLY CHANNEL. Nothing else will raise the alarm, so
 * the bubble is built to be hard to ignore rather than tasteful: it re-announces
 * itself, it counts up in plain sight, and it will not be dismissed — only
 * acknowledged, which is recorded against the operator who did it.
 *
 * Polled, not subscribed. Dashboard operators are not Supabase auth users, so a
 * realtime subscription would mean exposing safety_alerts to `anon` — an alert
 * carries someone's phone number, their location and their emergency contact,
 * and none of that may sit behind a key shipped in every app build. Polling goes
 * through the same authenticated admin path as the rest of the dashboard.
 */

const POLL_MS = 10000;

type Alert = {
  id: string;
  raised_by_role: "customer" | "driver";
  kind: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  acknowledged_at: string | null;
  police_called_at: string | null;
  emergency_contact_called_at: string | null;
  person: { fullName: string | null; phone: string | null } | null;
  emergencyContact: { name: string | null; phone: string | null; relationship: string | null } | null;
  ride: {
    id: string;
    status: string;
    pickup_address: string | null;
    destination_address: string | null;
    share_token: string | null;
  } | null;
};

const callAction = async (action: string, payload: Record<string, unknown> = {}) => {
  const res = await fetch("/api/admin/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};

const sinceLabel = (iso: string) => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} mins ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
};

export default function SafetyAlertBubble() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  const announced = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const data = await callAction("list_safety_alerts");
      const next: Alert[] = data?.alerts ?? data?.data?.alerts ?? [];
      setAlerts(next);

      // Announce each alert once, and open the panel the first time one lands.
      // An operator looking at another tab gets a sound; one looking at this
      // screen gets the panel already open.
      const fresh = next.filter((a) => !announced.current.has(a.id));
      if (fresh.length) {
        fresh.forEach((a) => announced.current.add(a.id));
        setOpen(true);
        try {
          new Audio(
            "data:audio/wav;base64,UklGRlwAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YTgAAAAA" +
              "AAB/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/",
          ).play();
        } catch {
          // Autoplay policy may refuse until the operator has interacted with
          // the page. The visual alarm does not depend on it.
        }
      }
    } catch {
      // A failed poll is a bad moment on the network. The next one is 10s away,
      // and going quiet about existing alerts would be worse than stale ones.
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(load, POLL_MS);
    // Re-render every 15s so the "how long has this been open" clock stays true
    // without another network call.
    const clock = setInterval(() => forceTick((n) => n + 1), 15000);
    return () => {
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [load]);

  const act = async (alertId: string, payload: Record<string, unknown>) => {
    setBusy(alertId);
    try {
      await callAction("update_safety_alert", { alertId, ...payload });
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (!alerts.length) return null;

  const unacknowledged = alerts.filter((a) => a.status === "open");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${alerts.length} safety alert${alerts.length === 1 ? "" : "s"}`}
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "13px 18px",
          borderRadius: 999,
          border: "none",
          cursor: "pointer",
          color: "#fff",
          fontWeight: 700,
          fontSize: 14,
          background: unacknowledged.length ? "#B00020" : "#8A6D0B",
          boxShadow: "0 10px 30px rgba(0,0,0,.32)",
          animation: unacknowledged.length ? "sosPulse 1.4s ease-in-out infinite" : "none",
        }}
      >
        <span style={{ fontSize: 16 }}>🚨</span>
        {unacknowledged.length
          ? `${unacknowledged.length} SOS needs attention`
          : `${alerts.length} alert${alerts.length === 1 ? "" : "s"} in progress`}
      </button>

      <style>{`
        @keyframes sosPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 10px 30px rgba(176,0,32,.42); }
          50% { transform: scale(1.045); box-shadow: 0 12px 40px rgba(176,0,32,.75); }
        }
        @media (prefers-reduced-motion: reduce) { button { animation: none !important; } }
      `}</style>

      {open ? (
        <div
          style={{
            position: "fixed",
            right: 20,
            bottom: 84,
            zIndex: 9999,
            width: 400,
            maxWidth: "calc(100vw - 40px)",
            maxHeight: "72vh",
            overflowY: "auto",
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #E5E7EB",
            boxShadow: "0 24px 60px rgba(0,0,0,.28)",
          }}
        >
          {alerts.map((alert) => {
            const who = alert.person?.fullName || "Unknown";
            const isBusy = busy === alert.id;
            const mapUrl =
              alert.latitude && alert.longitude
                ? `https://www.google.com/maps?q=${alert.latitude},${alert.longitude}`
                : null;

            return (
              <div key={alert.id} style={{ padding: 16, borderBottom: "1px solid #F0F0F0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <strong style={{ fontSize: 14 }}>
                    {alert.raised_by_role === "driver" ? "Driver" : "Rider"} · {who}
                  </strong>
                  <span style={{ fontSize: 12, color: alert.status === "open" ? "#B00020" : "#6B7280" }}>
                    {sinceLabel(alert.created_at)}
                  </span>
                </div>

                <div style={{ fontSize: 12.5, color: "#374151", marginTop: 8, lineHeight: 1.65 }}>
                  {alert.person?.phone ? (
                    <div>
                      Phone: <a href={`tel:${alert.person.phone}`}>{alert.person.phone}</a>
                    </div>
                  ) : null}

                  {alert.emergencyContact?.phone ? (
                    <div>
                      Emergency contact: {alert.emergencyContact.name || "—"}
                      {alert.emergencyContact.relationship
                        ? ` (${alert.emergencyContact.relationship})`
                        : ""}{" "}
                      · <a href={`tel:${alert.emergencyContact.phone}`}>{alert.emergencyContact.phone}</a>
                    </div>
                  ) : (
                    <div style={{ color: "#B00020" }}>No emergency contact on file</div>
                  )}

                  {alert.ride ? (
                    <div>
                      Trip: {alert.ride.pickup_address || "—"} → {alert.ride.destination_address || "—"}
                      {alert.ride.share_token ? (
                        <>
                          {" · "}
                          <a
                            href={`https://dropapp.pro/track?t=${alert.ride.share_token}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            watch live
                          </a>
                        </>
                      ) : null}
                    </div>
                  ) : (
                    <div>Not on a trip when raised</div>
                  )}

                  {mapUrl ? (
                    <div>
                      Position when raised:{" "}
                      <a href={mapUrl} target="_blank" rel="noreferrer">
                        open in maps
                      </a>
                    </div>
                  ) : (
                    <div style={{ color: "#8A6D0B" }}>No location captured</div>
                  )}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                  {alert.status === "open" ? (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => act(alert.id, { acknowledge: true })}
                      style={btn("#B00020", "#fff")}
                    >
                      I'm on this
                    </button>
                  ) : null}

                  <button
                    type="button"
                    disabled={isBusy || Boolean(alert.police_called_at)}
                    onClick={() => act(alert.id, { calledPolice: true })}
                    style={btn("#fff", "#111", true)}
                  >
                    {alert.police_called_at ? "Police called ✓" : "Called police"}
                  </button>

                  <button
                    type="button"
                    disabled={isBusy || Boolean(alert.emergency_contact_called_at)}
                    onClick={() => act(alert.id, { calledEmergencyContact: true })}
                    style={btn("#fff", "#111", true)}
                  >
                    {alert.emergency_contact_called_at ? "Contact called ✓" : "Called contact"}
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => act(alert.id, { resolve: true })}
                    style={btn("#fff", "#111", true)}
                  >
                    Resolved
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => act(alert.id, { resolve: true, falseAlarm: true })}
                    style={btn("#fff", "#6B7280", true)}
                  >
                    False alarm
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

const btn = (bg: string, color: string, outlined = false) => ({
  padding: "7px 11px",
  borderRadius: 8,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  background: bg,
  color,
  border: outlined ? "1px solid #D8DCE2" : "none",
});
