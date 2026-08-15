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
// Three consecutive misses, so roughly 30 seconds. One failed poll is a network
// blip and shouting about it would train operators to ignore this corner of the
// screen; half a minute of silence from the safety feed is worth saying out loud.
const FAILURE_THRESHOLD = 3;

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

/**
 * An actual audible tone, synthesised.
 *
 * This was a base64 WAV until a review noticed it was 56 bytes of silence — the
 * alarm made no sound at all, and every check of it had been reading the code
 * rather than listening. WebAudio needs no asset and cannot be silently wrong in
 * the same way: two short rising beeps, deliberately unlike a notification chime.
 */
const sound = () => {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();

    [0, 0.28].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = i === 0 ? 660 : 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.32, ctx.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.24);
    });

    setTimeout(() => void ctx.close(), 1200);
  } catch {
    // Autoplay policy refuses until the operator has interacted with the page.
    // The visual alarm never depended on this.
  }
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
  // How the feed itself is doing, which is a separate question from whether
  // there are alerts — and one this component used to have no way of answering.
  const [misses, setMisses] = useState(0);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  // The last day, closed ones included. Only fetched while the panel is open —
  // a shift handover wants it, a 10-second poll does not.
  const [recent, setRecent] = useState<Alert[]>([]);

  // `withRecent` is passed explicitly rather than read from the open state,
  // because the poll and the panel want different things: the poll wants the
  // short active list every ten seconds, and the day of history is only worth
  // fetching at the moment somebody actually opens the panel. Deriving it from
  // `open` meant a 24-hour query on every tick for as long as the panel stayed
  // up, which is not what the comment claimed and not what was wanted.
  const load = useCallback(async (withRecent = false) => {
    try {
      const data = await callAction("list_safety_alerts", {
        includeRecent: withRecent,
      });
      const next: Alert[] = data?.alerts ?? data?.data?.alerts ?? [];
      setAlerts(next);
      const history: Alert[] | undefined = data?.recent ?? data?.data?.recent;
      if (history) setRecent(history);
      setMisses(0);
      setLastOkAt(Date.now());

      // Announce each alert once, and open the panel the first time one lands.
      // An operator looking at another tab gets a sound; one looking at this
      // screen gets the panel already open.
      const fresh = next.filter((a) => !announced.current.has(a.id));
      if (fresh.length) {
        fresh.forEach((a) => announced.current.add(a.id));
        setOpen(true);
        sound();
      }
    } catch {
      // Alerts already on screen are kept: going quiet about a live emergency
      // because one poll failed would be worse than showing a stale one. But the
      // failure is counted, and once it is sustained the operator is told.
      setMisses((n) => n + 1);
    }
  }, []);

  useEffect(() => {
    void load();
    // Wrapped, so the timer's own argument can never arrive as `withRecent`.
    const timer = setInterval(() => void load(), POLL_MS);
    // Re-render every 15s so the "how long has this been open" clock stays true
    // without another network call.
    const clock = setInterval(() => forceTick((n) => n + 1), 15000);
    return () => {
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [load]);

  useEffect(() => {
    if (open) void load(true);
  }, [open, load]);

  const act = async (alertId: string, payload: Record<string, unknown>) => {
    setBusy(alertId);
    try {
      await callAction("update_safety_alert", { alertId, ...payload });
      // With history: closing an alert moves it out of the active list and into
      // the last-24-hours section, and both should update together.
      await load(true);
    } finally {
      setBusy(null);
    }
  };

  const unacknowledged = alerts.filter((a) => a.status === "open");
  // Said they were safe, still nobody has closed it. Not an emergency any more —
  // so no red, no pulse, no sound — but it stays here until an operator looks.
  const awaitingReview = alerts.filter((a) => a.status === "stood_down");
  const liveEmergency = alerts.length > awaitingReview.length;
  const feedFailing = misses >= FAILURE_THRESHOLD;

  // The old behaviour was `if (!alerts.length) return null`, and it is the reason
  // a real SOS took a database query to find. Three states rendered as absolutely
  // nothing: no alerts, the feed broken, and the component not in the build at
  // all. An operator looking at a quiet screen could not tell which — and on the
  // one feature where silence IS the failure mode, that is backwards.
  //
  // So something is always on screen. A muted "monitoring" pill when all is well,
  // which is deliberately dull and does not pulse or make noise; a loud one when
  // the feed has stopped answering. If the corner is now completely empty, the
  // component is not running, and that is a fact worth being able to see.
  if (!alerts.length) {
    return (
      <div
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          zIndex: 9998,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: feedFailing ? "11px 16px" : "8px 14px",
          borderRadius: 999,
          fontWeight: feedFailing ? 700 : 500,
          fontSize: feedFailing ? 13 : 12,
          color: feedFailing ? "#fff" : "#6B7280",
          background: feedFailing ? "#8A6D0B" : "#F3F4F6",
          border: feedFailing ? "none" : "1px solid #E5E7EB",
          boxShadow: feedFailing
            ? "0 10px 30px rgba(0,0,0,.32)"
            : "0 2px 8px rgba(0,0,0,.06)",
        }}
        title={
          feedFailing
            ? "The dashboard cannot reach the safety feed. Alerts raised now may not appear."
            : "Safety alerts are being checked every 10 seconds."
        }
      >
        <span aria-hidden style={{ fontSize: feedFailing ? 15 : 13 }}>
          {feedFailing ? "\u26A0\uFE0F" : "\u{1F6E1}\uFE0F"}
        </span>
        {feedFailing ? (
          <span role="alert">
            Safety feed unavailable
            {lastOkAt ? ` \u00B7 last seen ${sinceLabel(new Date(lastOkAt).toISOString())}` : ""}
          </span>
        ) : (
          <span>No active alerts</span>
        )}
      </div>
    );
  }

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
          background: unacknowledged.length
            ? "#B00020"
            : liveEmergency
              ? "#8A6D0B"
              : "#4B5563",
          boxShadow: "0 10px 30px rgba(0,0,0,.32)",
          animation: unacknowledged.length ? "sosPulse 1.4s ease-in-out infinite" : "none",
        }}
      >
        <span style={{ fontSize: 16 }}>{liveEmergency ? "🚨" : "📋"}</span>
        {unacknowledged.length
          ? `${unacknowledged.length} SOS needs attention`
          : liveEmergency
            ? `${alerts.length} alert${alerts.length === 1 ? "" : "s"} in progress`
            : `${awaitingReview.length} stood down, needs closing`}
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

                {alert.status === "stood_down" ? (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "7px 10px",
                      borderRadius: 8,
                      background: "#F3F4F6",
                      color: "#374151",
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}
                  >
                    <strong>They say they are safe.</strong> Still open for you to
                    check and close — the app cannot close it.
                  </div>
                ) : null}

                <div style={{ fontSize: 12.5, color: "#374151", marginTop: 8, lineHeight: 1.65 }}>
                  {alert.person?.phone ? (
                    <div>
                      Phone: <a href={`tel:${alert.person.phone}`}>{alert.person.phone}</a>
                    </div>
                  ) : null}

                  {alert.emergencyContact?.phone ? (
                    <div>
                      Emergency contact: {alert.emergencyContact.name || "Name not given"}
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

          {/* What happened, whether or not it still needs anyone.
              getSafetyAlerts deliberately returns only what is outstanding, so
              before this the dashboard could not show a closed alert at all —
              includeResolved existed in dashboard-data.js and in drop-admin and
              no screen ever passed it. Someone coming on shift could not see
              that three SOS alerts had been raised overnight. */}
          <div style={{ padding: "14px 16px", background: "#FAFAFA" }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.6,
                color: "#6B7280",
                textTransform: "uppercase",
              }}
            >
              Last 24 hours
            </div>

            {recent.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "#6B7280", marginTop: 8 }}>
                Nothing raised in the last day.
              </div>
            ) : (
              recent.map((item) => (
                <div
                  key={`recent-${item.id}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    fontSize: 12.5,
                    color: "#374151",
                    padding: "7px 0",
                    borderBottom: "1px solid #EFEFEF",
                  }}
                >
                  <span>
                    {item.raised_by_role === "driver" ? "Driver" : "Rider"}
                    {item.person?.fullName ? ` · ${item.person.fullName}` : ""}
                  </span>
                  <span style={{ color: statusColour(item.status), fontWeight: 600 }}>
                    {statusLabel(item.status)} · {sinceLabel(item.created_at)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Plain words, because an operator should not have to learn the enum. */
const statusLabel = (status: string) => {
  switch (status) {
    case "open":
      return "Still open";
    case "acknowledged":
      return "Being handled";
    case "stood_down":
      return "Stood down, not closed";
    case "false_alarm":
      return "False alarm";
    case "resolved":
      return "Closed";
    default:
      return status;
  }
};

const statusColour = (status: string) => {
  if (status === "open") return "#B00020";
  if (status === "acknowledged" || status === "stood_down") return "#8A6D0B";
  return "#6B7280";
};

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
