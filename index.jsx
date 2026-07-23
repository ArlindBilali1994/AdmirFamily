import React, { useState, useEffect, useRef } from "react";
import { Home, MessageCircle, Calendar as CalendarIcon, CheckSquare, LogOut, Send, Plus, Trash2, Check, User, Download, X } from "lucide-react";

const AVATAR_COLORS = ["#A44A5D", "#2C4A3E", "#8FA888", "#C9975A", "#5A7A9E"];

const TAPE = () => (
  <div style={{
    position: "absolute", top: -14, left: "50%", transform: "translateX(-50%) rotate(-3deg)",
    width: 90, height: 26, background: "rgba(243,213,127,0.85)",
    boxShadow: "0 1px 2px rgba(0,0,0,0.15)", borderRadius: 2
  }} />
);

function useStorage() {
  const load = async (key, fallback) => {
    try {
      const res = await window.storage.get(key, true);
      return res ? JSON.parse(res.value) : fallback;
    } catch (e) {
      return fallback;
    }
  };
  const save = async (key, value) => {
    try { await window.storage.set(key, JSON.stringify(value), true); } catch (e) {}
  };
  return { load, save };
}

export default function FamilienApp() {
  const { load, save } = useStorage();
  const [ready, setReady] = useState(false);
  const [users, setUsers] = useState({});
  const [messages, setMessages] = useState([]);
  const [events, setEvents] = useState([]);
  const [todos, setTodos] = useState([]);
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState("home");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [authError, setAuthError] = useState("");
  const [notifPermission, setNotifPermission] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const [unread, setUnread] = useState({ messages: 0, calendar: 0, todos: 0 });
  const scrollRef = useRef(null);
  const prevRef = useRef({ messages: [], events: [], todos: [] });
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    } else {
      setShowInstallHelp(true);
    }
  };

  useEffect(() => {
    (async () => {
      let [u, m, e, t] = await Promise.all([
        load("family:users", {}),
        load("family:messages", []),
        load("family:events", []),
        load("family:todos", []),
      ]);
      if (Object.keys(u).length === 0) {
        u = { admir: { name: "Admir", color: AVATAR_COLORS[0] } };
        await save("family:users", u);
      }
      setUsers(u); setMessages(m); setEvents(e); setTodos(t);
      prevRef.current = { messages: m, events: e, todos: t };
      setReady(true);
    })();
  }, []);

  // Poll shared storage for changes made by others and surface notifications
  useEffect(() => {
    if (!session) return;
    const notify = (title, body) => {
      if (notifPermission === "granted" && typeof Notification !== "undefined") {
        try { new Notification(title, { body }); } catch (e) {}
      }
    };
    const interval = setInterval(async () => {
      const [m, e, t] = await Promise.all([
        load("family:messages", []),
        load("family:events", []),
        load("family:todos", []),
      ]);
      const prev = prevRef.current;

      const newMsgs = m.filter(x => x.author !== session && !prev.messages.some(p => p.id === x.id));
      if (newMsgs.length) {
        setMessages(m);
        if (tab !== "messages") setUnread(u => ({ ...u, messages: u.messages + newMsgs.length }));
        newMsgs.forEach(nm => notify(`${users[nm.author]?.name || "Familie"} hat geschrieben`, nm.text));
      } else if (m.length !== prev.messages.length) {
        setMessages(m);
      }

      const newEvents = e.filter(x => x.author !== session && !prev.events.some(p => p.id === x.id));
      if (newEvents.length) {
        setEvents(e);
        if (tab !== "calendar") setUnread(u => ({ ...u, calendar: u.calendar + newEvents.length }));
        newEvents.forEach(ne => notify("Neuer Termin", `${ne.title} am ${ne.date}`));
      } else if (e.length !== prev.events.length) {
        setEvents(e);
      }

      const newTodos = t.filter(x => x.author !== session && !prev.todos.some(p => p.id === x.id));
      if (newTodos.length) {
        setTodos(t);
        if (tab !== "todos") setUnread(u => ({ ...u, todos: u.todos + newTodos.length }));
        newTodos.forEach(nt => notify("Neue Aufgabe", nt.text));
      } else if (t.length !== prev.todos.length || JSON.stringify(t) !== JSON.stringify(prev.todos)) {
        setTodos(t);
      }

      prevRef.current = { messages: m, events: e, todos: t };
    }, 4000);
    return () => clearInterval(interval);
  }, [session, tab, notifPermission, users]);

  useEffect(() => {
    if (tab === "messages") setUnread(u => ({ ...u, messages: 0 }));
    if (tab === "calendar") setUnread(u => ({ ...u, calendar: 0 }));
    if (tab === "todos") setUnread(u => ({ ...u, todos: 0 }));
  }, [tab]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, tab]);

  const login = (key) => {
    setSession(key); setTab("home");
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().then(setNotifPermission);
    }
  };

  const addMember = async (e) => {
    e.preventDefault();
    setAuthError("");
    const name = newName.trim();
    if (!name) { setAuthError("Bitte einen Namen eingeben."); return; }
    const key = name.toLowerCase();
    if (users[key]) { setAuthError("Diesen Namen gibt es schon."); return; }
    if (Object.keys(users).length >= 8) { setAuthError("Maximale Anzahl an Mitgliedern erreicht."); return; }
    const color = AVATAR_COLORS[Object.keys(users).length % AVATAR_COLORS.length];
    const newUsers = { ...users, [key]: { name, color } };
    setUsers(newUsers);
    await save("family:users", newUsers);
    setNewName(""); setShowAdd(false);
    setSession(key); setTab("home");
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().then(setNotifPermission);
    }
  };

  const logout = () => { setSession(null); };

  const sendMessage = async (text) => {
    if (!text.trim()) return;
    const msg = { id: Date.now(), author: session, text: text.trim(), ts: Date.now() };
    const next = [...messages, msg];
    setMessages(next);
    await save("family:messages", next);
  };

  const addEvent = async (title, date, time) => {
    if (!title.trim() || !date) return;
    const ev = { id: Date.now(), title: title.trim(), date, time, author: session };
    const next = [...events, ev].sort((a, b) => (a.date + (a.time||"")).localeCompare(b.date + (b.time||"")));
    setEvents(next);
    await save("family:events", next);
  };

  const deleteEvent = async (id) => {
    const next = events.filter(ev => ev.id !== id);
    setEvents(next);
    await save("family:events", next);
  };

  const addTodo = async (text) => {
    if (!text.trim()) return;
    const td = { id: Date.now(), text: text.trim(), done: false, author: session };
    const next = [...todos, td];
    setTodos(next);
    await save("family:todos", next);
  };

  const toggleTodo = async (id) => {
    const next = todos.map(t => t.id === id ? { ...t, done: !t.done } : t);
    setTodos(next);
    await save("family:todos", next);
  };

  const deleteTodo = async (id) => {
    const next = todos.filter(t => t.id !== id);
    setTodos(next);
    await save("family:todos", next);
  };

  const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("de-AT", { weekday: "short", day: "2-digit", month: "short" });
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter(e => e.date >= today);

  const installHelpModal = showInstallHelp && (
    <div style={{ position: "absolute", inset: 0, background: "rgba(43,38,32,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 22, maxWidth: 320, position: "relative" }}>
        <button onClick={() => setShowInstallHelp(false)} style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", cursor: "pointer", color: "#A79E8C" }}>
          <X size={18} />
        </button>
        <div className="disp" style={{ fontSize: 17, fontWeight: 700, color: "#2C4A3E", marginBottom: 12 }}>App installieren</div>
        {isIOS ? (
          <div style={{ fontSize: 14, color: "#2B2620", lineHeight: 1.6 }}>
            1. Tippe unten auf das <b>Teilen-Symbol</b> (Quadrat mit Pfeil) in Safari.<br />
            2. Wähle <b>„Zum Home-Bildschirm"</b>.<br />
            3. Bestätige mit <b>„Hinzufügen"</b>.
          </div>
        ) : (
          <div style={{ fontSize: 14, color: "#2B2620", lineHeight: 1.6 }}>
            1. Öffne das <b>Menü</b> (⋮) oben rechts im Browser.<br />
            2. Wähle <b>„App installieren"</b> oder <b>„Zum Startbildschirm hinzufügen"</b>.<br />
            3. Bestätige die Installation.
          </div>
        )}
      </div>
    </div>
  );

  const fontLink = (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Karla:wght@400;500;700&display=swap');
      * { box-sizing: border-box; font-family: 'Karla', sans-serif; }
      .disp { font-family: 'Fraunces', serif; }
      input, button, textarea { font-family: inherit; }
      ::-webkit-scrollbar { width: 6px; }
      ::-webkit-scrollbar-thumb { background: #d8cfbd; border-radius: 3px; }
    `}</style>
  );

  if (!ready) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 500, background: "#FBF7EE", color: "#2B2620" }}>
        {fontLink}
        Lädt…
      </div>
    );
  }

  // ---- AUTH SCREEN ----
  if (!session) {
    return (
      <div style={{ minHeight: 560, background: "#FBF7EE", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, position: "relative" }}>
        {fontLink}
        <div style={{ width: "100%", maxWidth: 360 }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div className="disp" style={{ fontSize: 34, fontWeight: 700, color: "#2C4A3E" }}>Zuhause</div>
            <div style={{ color: "#7A7264", fontSize: 14, marginTop: 4 }}>Nachrichten, Kalender & To-dos für die Familie</div>
          </div>

          <button onClick={handleInstall} style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "12px 0", borderRadius: 12, border: "1px solid #2C4A3E", background: "#2C4A3E",
            color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 24
          }}>
            <Download size={17} /> Als App installieren
          </button>

          <div style={{ background: "#fff", borderRadius: 18, padding: 24, boxShadow: "0 8px 24px rgba(44,74,62,0.08)", position: "relative" }}>
            <TAPE />
            <div style={{ fontSize: 13, color: "#7A7264", marginBottom: 14, fontWeight: 600 }}>Wer bist du?</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {Object.entries(users).map(([key, u]) => (
                <button key={key} onClick={() => login(key)} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12,
                  border: "1px solid #EDE6D6", background: "#FBF7EE", cursor: "pointer", textAlign: "left"
                }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: u.color, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                    {u.name[0].toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 600, fontSize: 15, color: "#2B2620" }}>{u.name}</span>
                </button>
              ))}
            </div>

            {!showAdd && (
              <button onClick={() => { setShowAdd(true); setAuthError(""); }} style={{
                width: "100%", padding: "10px 0", borderRadius: 10, border: "1px dashed #C9B9A0", background: "none",
                color: "#7A7264", fontWeight: 600, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6
              }}>
                <Plus size={16} /> Neues Familienmitglied
              </button>
            )}

            {showAdd && (
              <form onSubmit={addMember}>
                <input value={newName} onChange={e => setNewName(e.target.value)} autoFocus
                  placeholder="Name eingeben"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #E4DCC9", marginBottom: 10, fontSize: 15 }} />
                {authError && <div style={{ color: "#A44A5D", fontSize: 13, marginBottom: 10 }}>{authError}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" style={{
                    flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: "#A44A5D",
                    color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer"
                  }}>Hinzufügen</button>
                  <button type="button" onClick={() => { setShowAdd(false); setNewName(""); setAuthError(""); }} style={{
                    padding: "10px 16px", borderRadius: 10, border: "1px solid #E4DCC9", background: "none",
                    color: "#7A7264", fontWeight: 600, fontSize: 14, cursor: "pointer"
                  }}>Abbrechen</button>
                </div>
              </form>
            )}
          </div>
        </div>
        {installHelpModal}
      </div>
    );
  }

  const me = users[session];

  const NavBtn = ({ id, icon: Icon, label, count }) => (
    <button onClick={() => setTab(id)} style={{
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 0",
      background: "none", border: "none", cursor: "pointer", color: tab === id ? "#2C4A3E" : "#A79E8C", position: "relative"
    }}>
      <div style={{ position: "relative" }}>
        <Icon size={20} strokeWidth={tab === id ? 2.4 : 2} />
        {count > 0 && (
          <span style={{
            position: "absolute", top: -6, right: -8, background: "#A44A5D", color: "#fff",
            fontSize: 10, fontWeight: 700, borderRadius: 8, minWidth: 15, height: 15,
            display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px"
          }}>{count > 9 ? "9+" : count}</span>
        )}
      </div>
      <span style={{ fontSize: 11, fontWeight: tab === id ? 700 : 500 }}>{label}</span>
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: 600, maxWidth: 400, margin: "0 auto", background: "#FBF7EE", borderRadius: 20, overflow: "hidden", boxShadow: "0 10px 30px rgba(44,74,62,0.12)", position: "relative" }}>
      {fontLink}

      {/* Header */}
      <div style={{ background: "#2C4A3E", color: "#fff", padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="disp" style={{ fontSize: 20, fontWeight: 700 }}>
            {tab === "home" && "Zuhause"}
            {tab === "messages" && "Nachrichten"}
            {tab === "calendar" && "Kalender"}
            {tab === "todos" && "To-dos"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: me.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>
            {me.name[0].toUpperCase()}
          </div>
          <button onClick={logout} title="Abmelden" style={{ background: "none", border: "none", color: "#E4DCC9", cursor: "pointer" }}>
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {installHelpModal}

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {tab === "home" && (
          <div>
            {notifPermission !== "granted" && notifPermission !== "unsupported" && (
              <div style={{ background: "#F3EFE4", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#7A7264", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <span>Benachrichtigungen sind noch nicht aktiviert.</span>
                <button onClick={() => Notification.requestPermission().then(setNotifPermission)} style={{
                  background: "#2C4A3E", color: "#fff", border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap"
                }}>Aktivieren</button>
              </div>
            )}
            <div style={{ background: "#fff", borderRadius: 16, padding: 18, position: "relative", marginBottom: 16, boxShadow: "0 4px 14px rgba(0,0,0,0.05)" }}>
              <TAPE />
              <div style={{ fontSize: 13, color: "#A79E8C" }}>{new Date().toLocaleDateString("de-AT", { weekday: "long", day: "2-digit", month: "long" })}</div>
              <div className="disp" style={{ fontSize: 19, fontWeight: 700, color: "#2C4A3E", marginTop: 2 }}>Willkommen zurück, {me.name}!</div>
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: "#7A7264", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Nächste Termine</div>
            {upcoming.length === 0 && <div style={{ color: "#A79E8C", fontSize: 14, marginBottom: 16 }}>Keine anstehenden Termine.</div>}
            {upcoming.slice(0, 3).map(ev => (
              <div key={ev.id} style={{ background: "#fff", borderRadius: 12, padding: 12, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{ev.title}</div>
                  <div style={{ fontSize: 12, color: "#A79E8C" }}>{fmtDate(ev.date)}{ev.time ? ` · ${ev.time}` : ""}</div>
                </div>
              </div>
            ))}

            <div style={{ fontSize: 13, fontWeight: 700, color: "#7A7264", margin: "16px 0 8px", textTransform: "uppercase", letterSpacing: 0.5 }}>Offene To-dos</div>
            {todos.filter(t => !t.done).length === 0 && <div style={{ color: "#A79E8C", fontSize: 14 }}>Alles erledigt 🎉</div>}
            {todos.filter(t => !t.done).slice(0, 4).map(t => (
              <div key={t.id} style={{ background: "#fff", borderRadius: 12, padding: 12, marginBottom: 8, fontSize: 14 }}>{t.text}</div>
            ))}
          </div>
        )}

        {tab === "messages" && (
          <div ref={scrollRef} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.length === 0 && <div style={{ color: "#A79E8C", textAlign: "center", marginTop: 40 }}>Noch keine Nachrichten. Schreib die erste!</div>}
            {messages.map(m => {
              const author = users[m.author];
              const mine = m.author === session;
              return (
                <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
                  {!mine && <div style={{ fontSize: 11, color: "#A79E8C", marginBottom: 2, marginLeft: 4 }}>{author?.name || m.author}</div>}
                  <div style={{
                    maxWidth: "78%", padding: "9px 13px", borderRadius: 16,
                    background: mine ? "#2C4A3E" : "#fff", color: mine ? "#fff" : "#2B2620",
                    borderBottomRightRadius: mine ? 4 : 16, borderBottomLeftRadius: mine ? 16 : 4,
                    boxShadow: "0 2px 6px rgba(0,0,0,0.05)", fontSize: 14
                  }}>{m.text}</div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "calendar" && (
          <div>
            <AddEventForm onAdd={addEvent} />
            {events.length === 0 && <div style={{ color: "#A79E8C", textAlign: "center", marginTop: 24 }}>Noch keine Termine eingetragen.</div>}
            {events.map(ev => (
              <div key={ev.id} style={{ background: "#fff", borderRadius: 12, padding: 12, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", opacity: ev.date < today ? 0.5 : 1 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{ev.title}</div>
                  <div style={{ fontSize: 12, color: "#A79E8C" }}>{fmtDate(ev.date)}{ev.time ? ` · ${ev.time}` : ""} · von {users[ev.author]?.name || "?"}</div>
                </div>
                <button onClick={() => deleteEvent(ev.id)} style={{ background: "none", border: "none", color: "#C9B9A0", cursor: "pointer" }}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        )}

        {tab === "todos" && (
          <div>
            <AddTodoForm onAdd={addTodo} />
            {todos.length === 0 && <div style={{ color: "#A79E8C", textAlign: "center", marginTop: 24 }}>Noch keine Aufgaben.</div>}
            {todos.map(t => (
              <div key={t.id} style={{ background: "#fff", borderRadius: 12, padding: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => toggleTodo(t.id)} style={{
                  width: 22, height: 22, borderRadius: 6, border: `2px solid ${t.done ? "#8FA888" : "#D8CFBD"}`,
                  background: t.done ? "#8FA888" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0
                }}>
                  {t.done && <Check size={14} color="#fff" />}
                </button>
                <div style={{ flex: 1, fontSize: 14, textDecoration: t.done ? "line-through" : "none", color: t.done ? "#A79E8C" : "#2B2620" }}>{t.text}</div>
                <button onClick={() => deleteTodo(t.id)} style={{ background: "none", border: "none", color: "#C9B9A0", cursor: "pointer" }}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {tab === "messages" && <MessageInput onSend={sendMessage} />}

      {/* Bottom nav */}
      <div style={{ display: "flex", borderTop: "1px solid #EDE6D6", background: "#fff" }}>
        <NavBtn id="home" icon={Home} label="Start" count={0} />
        <NavBtn id="messages" icon={MessageCircle} label="Chat" count={unread.messages} />
        <NavBtn id="calendar" icon={CalendarIcon} label="Kalender" count={unread.calendar} />
        <NavBtn id="todos" icon={CheckSquare} label="To-dos" count={unread.todos} />
      </div>
    </div>
  );
}

function MessageInput({ onSend }) {
  const [text, setText] = useState("");
  const submit = (e) => { e.preventDefault(); onSend(text); setText(""); };
  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #EDE6D6", background: "#fff" }}>
      <input value={text} onChange={e => setText(e.target.value)} placeholder="Nachricht schreiben…"
        style={{ flex: 1, padding: "10px 14px", borderRadius: 20, border: "1px solid #E4DCC9", fontSize: 14 }} />
      <button type="submit" style={{ width: 40, height: 40, borderRadius: "50%", background: "#A44A5D", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <Send size={17} />
      </button>
    </form>
  );
}

function AddEventForm({ onAdd }) {
  const [title, setTitle] = useState(""); const [date, setDate] = useState(""); const [time, setTime] = useState("");
  const submit = (e) => { e.preventDefault(); onAdd(title, date, time); setTitle(""); setDate(""); setTime(""); };
  return (
    <form onSubmit={submit} style={{ background: "#fff", borderRadius: 12, padding: 12, marginBottom: 14, display: "flex", flexDirection: "column", gap: 8 }}>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titel des Termins"
        style={{ padding: "9px 11px", borderRadius: 8, border: "1px solid #E4DCC9", fontSize: 14 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} required
          style={{ flex: 1, padding: "9px 11px", borderRadius: 8, border: "1px solid #E4DCC9", fontSize: 13 }} />
        <input type="time" value={time} onChange={e => setTime(e.target.value)}
          style={{ flex: 1, padding: "9px 11px", borderRadius: 8, border: "1px solid #E4DCC9", fontSize: 13 }} />
      </div>
      <button type="submit" style={{ padding: "9px 0", borderRadius: 8, border: "none", background: "#2C4A3E", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Plus size={15} /> Termin hinzufügen
      </button>
    </form>
  );
}

function AddTodoForm({ onAdd }) {
  const [text, setText] = useState("");
  const submit = (e) => { e.preventDefault(); onAdd(text); setText(""); };
  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 8, marginBottom: 14 }}>
      <input value={text} onChange={e => setText(e.target.value)} placeholder="Neue Aufgabe…"
        style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #E4DCC9", fontSize: 14 }} />
      <button type="submit" style={{ width: 42, borderRadius: 8, border: "none", background: "#2C4A3E", color: "#fff", cursor: "pointer" }}>
        <Plus size={17} />
      </button>
    </form>
  );
}
