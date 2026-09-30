"use client";

import { useEffect, useRef, useState } from "react";
import { sendMessage, ApiError } from "../lib/api";
import type { ChatAnswer, ChatTurn, FacilityCard, ProviderCard } from "../lib/types";

const STRINGS = {
  en: {
    title: "HealTrip — Patient Decision Assistant",
    subtitle: "Describe what's going on. This helps you decide the right next step — it does not diagnose.",
    placeholder: "e.g. I have chest pain and I'm not sure whether to see a cardiologist, go to the ER, or get a second opinion.",
    send: "Send",
    sending: "Sending…",
    disclaimerFallback: "This assistant provides navigation, not a medical diagnosis. In an emergency, always go to the nearest emergency department.",
    trace: "Reasoning trace",
    hideTrace: "Hide trace",
    tool: "Tool",
    input: "Input",
    result: "Result",
    grounded: "Every claim above is traceable to a tool call — see the trace.",
    rejected: "A response was rejected for citing something not grounded in a tool result, and was retried.",
    langToggle: "العربية",
    feePrefix: "Fee",
    telehealth: "Telehealth available",
    emergencyBanner: "EMERGENCY — go to the nearest emergency department now",
    urgentBanner: "Urgent — prompt review recommended",
    routineBanner: "Routine",
    facilities: "Emergency-capable facilities",
    providers: "Matched providers",
    why: "Why",
  },
  ar: {
    title: "HealTrip — مساعد قرار المريض",
    subtitle: "صف ما تشعر به. هذا يساعدك على تحديد الخطوة التالية الصحيحة — ولا يقوم بالتشخيص.",
    placeholder: "مثال: أعاني من ألم في الصدر ولست متأكدًا إن كان يجب رؤية طبيب قلب أو الذهاب للطوارئ أو أخذ رأي ثانٍ.",
    send: "إرسال",
    sending: "جارٍ الإرسال…",
    disclaimerFallback: "هذا المساعد يقدم توجيهًا وليس تشخيصًا طبيًا. في حالات الطوارئ، توجّه دائمًا إلى أقرب قسم طوارئ.",
    trace: "مسار الاستدلال",
    hideTrace: "إخفاء المسار",
    tool: "الأداة",
    input: "المدخلات",
    result: "النتيجة",
    grounded: "كل ما ورد أعلاه يمكن تتبعه إلى استدعاء أداة فعلي — انظر المسار.",
    rejected: "تم رفض رد لأنه استند إلى معلومة غير موثقة بأداة، وأُعيدت المحاولة.",
    langToggle: "English",
    feePrefix: "الرسوم",
    telehealth: "متاح عن بُعد",
    emergencyBanner: "طارئ — توجّه إلى أقرب قسم طوارئ الآن",
    urgentBanner: "عاجل — يُنصح بمراجعة سريعة",
    routineBanner: "روتيني",
    facilities: "منشآت قادرة على استقبال الطوارئ",
    providers: "مقدمو الرعاية المطابقون",
    why: "السبب",
  },
} as const;

type UiStrings = { [K in keyof (typeof STRINGS)["en"]]: string };

function urgencyBanner(answer: ChatAnswer, t: UiStrings) {
  if (!answer.urgencyLevel || answer.urgencyLevel === "NEEDS_MORE_INFO") return null;
  const styles: Record<string, { bg: string; fg: string; label: string }> = {
    EMERGENCY: { bg: "var(--danger-soft)", fg: "var(--danger)", label: t.emergencyBanner },
    URGENT: { bg: "var(--warn-soft)", fg: "var(--warn)", label: t.urgentBanner },
    ROUTINE: { bg: "var(--ok-soft)", fg: "var(--ok)", label: t.routineBanner },
  };
  const style = styles[answer.urgencyLevel];
  if (!style) return null;
  return (
    <div style={{ background: style.bg, color: style.fg, padding: "8px 12px", borderRadius: 6, fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
      {style.label}
    </div>
  );
}

function ProviderCardView({ p, t }: { p: ProviderCard; t: UiStrings }) {
  const specialty = typeof p.specialty === "string" ? p.specialty : p.specialty?.name;
  const facility = typeof p.facility === "string" ? p.facility : p.facility?.name;
  const city = typeof p.facility === "object" ? p.facility?.city : undefined;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--rule)", borderRadius: 8, padding: 12, minWidth: 220 }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
      <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 2 }}>
        {specialty} · {facility}
        {city ? ` (${city})` : ""}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 6 }}>
        {t.feePrefix}: {p.feeAmount} {p.feeCurrency}
        {p.telehealth ? ` · ${t.telehealth}` : ""}
      </div>
    </div>
  );
}

function FacilityCardView({ f }: { f: FacilityCard }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--danger)", borderRadius: 8, padding: 12, minWidth: 220 }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{f.name}</div>
      <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 2 }}>
        {f.address}, {f.city}
      </div>
    </div>
  );
}

function TracePanel({ answer, t }: { answer: ChatAnswer; t: UiStrings }) {
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--rule)", borderRadius: 8, padding: 12, marginTop: 10, fontSize: 12 }}>
      <div style={{ marginBottom: 6, color: "var(--ink-2)" }}>
        stage: <code>{answer.trace.stageBefore}</code> → effective: <code>{answer.trace.stageEffective}</code> → next: <code>{answer.trace.stageAfter}</code>
      </div>
      <div style={{ marginBottom: 8, color: answer.trace.citationGuard.ok ? "var(--ok)" : "var(--danger)" }}>
        citation guard: {answer.trace.citationGuard.ok ? "ok" : "rejected"}
        {answer.trace.citationGuard.retried ? " (retried)" : ""}
        {answer.trace.citationGuard.violations.length > 0 && (
          <ul style={{ margin: "4px 0 0", paddingInlineStart: 18 }}>
            {answer.trace.citationGuard.violations.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        )}
      </div>
      {answer.trace.toolCalls.length === 0 ? (
        <div style={{ color: "var(--ink-3)" }}>No tool calls this turn.</div>
      ) : (
        answer.trace.toolCalls.map((call, i) => (
          <div key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: i < answer.trace.toolCalls.length - 1 ? "1px solid var(--rule)" : "none" }}>
            <div style={{ fontWeight: 600, color: call.isError ? "var(--danger)" : "var(--det)" }}>
              {t.tool}: {call.name}
              {call.isError ? " (error)" : ""}
            </div>
            <div style={{ color: "var(--ink-3)", marginTop: 2 }}>
              {t.input}: <code>{JSON.stringify(call.input)}</code>
            </div>
            <div style={{ color: "var(--ink-3)", marginTop: 2, wordBreak: "break-word" }}>
              {t.result}: <code>{JSON.stringify(call.result)}</code>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default function Page() {
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const t = STRINGS[locale];
  const dir = locale === "ar" ? "rtl" : "ltr";

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openTrace, setOpenTrace] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, loading]);

  async function handleSend(text?: string) {
    const message = (text ?? input).trim();
    if (!message || loading) return;

    setInput("");
    setError(null);
    setTurns((prev) => [...prev, { role: "user", content: message }]);
    setLoading(true);

    try {
      const answer = await sendMessage({ sessionId, locale, message });
      setSessionId(answer.sessionId);
      setTurns((prev) => [...prev, { role: "assistant", content: answer.message, answer }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong reaching the assistant.");
    } finally {
      setLoading(false);
    }
  }

  const lastDisclaimer = [...turns].reverse().find((tn) => tn.answer)?.answer?.disclaimer ?? t.disclaimerFallback;

  return (
    <div dir={dir} style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px 0", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{t.title}</h1>
          <p style={{ fontSize: 13.5, color: "var(--ink-2)", margin: "4px 0 0" }}>{t.subtitle}</p>
        </div>
        <button
          onClick={() => setLocale(locale === "en" ? "ar" : "en")}
          style={{ background: "var(--surface)", border: "1px solid var(--rule)", borderRadius: 6, padding: "6px 12px", fontSize: 13, flexShrink: 0 }}
        >
          {t.langToggle}
        </button>
      </header>

      <main style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, paddingBottom: 16 }}>
        {turns.map((turn, i) => (
          <div key={i} style={{ alignSelf: turn.role === "user" ? (dir === "rtl" ? "flex-start" : "flex-end") : dir === "rtl" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
            <div
              style={{
                background: turn.role === "user" ? "var(--llm-soft)" : "var(--surface)",
                border: turn.role === "assistant" ? "1px solid var(--rule)" : "none",
                borderRadius: 10,
                padding: "10px 14px",
                fontSize: 14.5,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
              }}
            >
              {turn.answer && urgencyBanner(turn.answer, t)}
              {turn.content}
            </div>

            {turn.answer && turn.answer.clarifyingQuestions.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {turn.answer.clarifyingQuestions.map((q, qi) => (
                  <button
                    key={qi}
                    onClick={() => handleSend(q)}
                    style={{ background: "var(--det-soft)", color: "var(--det)", border: "none", borderRadius: 14, padding: "5px 12px", fontSize: 12.5 }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {turn.answer && turn.answer.facilities.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--danger)", marginBottom: 6 }}>{t.facilities}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {turn.answer.facilities.map((f) => (
                    <FacilityCardView key={f.id} f={f} />
                  ))}
                </div>
              </div>
            )}

            {turn.answer && turn.answer.providers.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>{t.providers}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {turn.answer.providers.map((p) => (
                    <ProviderCardView key={p.id} p={p} t={t} />
                  ))}
                </div>
              </div>
            )}

            {turn.answer && (
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => setOpenTrace(openTrace === i ? null : i)}
                  style={{ background: "none", border: "none", color: "var(--det)", fontSize: 12, padding: 0 }}
                >
                  {openTrace === i ? t.hideTrace : `${t.trace} (${turn.answer.trace.toolCalls.length})`}
                </button>
                {openTrace === i && <TracePanel answer={turn.answer} t={t} />}
              </div>
            )}
          </div>
        ))}

        {loading && <div style={{ fontSize: 13, color: "var(--ink-3)" }}>{t.sending}</div>}
        {error && (
          <div style={{ background: "var(--danger-soft)", color: "var(--danger)", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>{error}</div>
        )}
        <div ref={bottomRef} />
      </main>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: "var(--paper)",
          paddingBlock: 12,
          borderTop: "1px solid var(--rule)",
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          style={{ display: "flex", gap: 8 }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.placeholder}
            disabled={loading}
            style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--rule)", background: "var(--surface)", fontSize: 14 }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            style={{ background: "var(--det)", color: "white", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 600, opacity: loading || !input.trim() ? 0.6 : 1 }}
          >
            {t.send}
          </button>
        </form>
        <p style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 8, marginBottom: 0 }}>{lastDisclaimer}</p>
      </div>
    </div>
  );
}
