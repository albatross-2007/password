"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────
type Step = "instructions" | "identity" | "otp" | "password" | "success";

// ── Helpers ───────────────────────────────────────────────────────────────────
const EMAIL_REGEX = /^[a-zA-Z]+\.(\d+)@sxcce\.edu\.in$/;

function validateEmail(email: string): string | null {
  if (!email) return "Email is required.";
  if (!EMAIL_REGEX.test(email))
    return "Email must be in the format yourname.rollnumber@sxcce.edu.in";
  return null;
}

function validateRollno(rollno: string): string | null {
  if (!rollno) return "Roll number is required.";
  if (!/^\d+$/.test(rollno)) return "Roll number must contain only digits.";
  if (rollno.length !== 6) return "Roll number must be exactly 6 digits.";
  return null;
}

function rollnoMatchesEmail(rollno: string, email: string): boolean {
  const m = email.match(EMAIL_REGEX);
  return !!m && m[1] === rollno;
}

// ── Step Indicator ─────────────────────────────────────────────────────────────
const STEPS: { key: Step; label: string }[] = [
  { key: "instructions", label: "Instructions" },
  { key: "identity", label: "Verification" },
  { key: "otp", label: "OTP" },
  { key: "password", label: "Password" },
  { key: "success", label: "Done" },
];

function StepIndicator({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center justify-center gap-1 mb-6 flex-wrap">
      {STEPS.map((s, i) => (
        <React.Fragment key={s.key}>
          <div className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                i < idx
                  ? "bg-green-500 text-white"
                  : i === idx
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {i < idx ? "✓" : i + 1}
            </div>
            <span className={`text-xs mt-1 ${i === idx ? "text-blue-600 font-semibold" : "text-gray-400"}`}>
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`h-0.5 w-4 sm:w-8 mt-[-12px] ${i < idx ? "bg-green-400" : "bg-gray-200"}`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg
      className="animate-spin inline-block w-4 h-4 mr-2 text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

// ── OTP Input (6 boxes) ────────────────────────────────────────────────────────
function OtpInput({
  value,
  onChange,
  onComplete,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  onComplete?: (otp: string) => void;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-focus the first box whenever all digits are cleared (e.g. after error)
  useEffect(() => {
    if (value.every((d) => !d)) {
      refs.current[0]?.focus();
    }
  }, [value]);

  const handleChange = (i: number, char: string) => {
    const digit = char.replace(/\D/g, "").slice(-1);
    const next = [...value];
    next[i] = digit;
    onChange(next);
    if (digit && i < 5) {
      refs.current[i + 1]?.focus();
    } else if (digit && i === 5 && next.every((d) => d !== "")) {
      // All 6 digits filled — trigger auto-verify
      onComplete?.(next.join(""));
    }
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !value[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const next = Array(6).fill("");
    pasted.split("").forEach((c, i) => (next[i] = c));
    onChange(next);
    const focusIdx = Math.min(pasted.length, 5);
    refs.current[focusIdx]?.focus();
    // If paste fills all 6 digits, trigger auto-verify
    if (pasted.length === 6) {
      onComplete?.(next.join(""));
    }
  };

  return (
    <div className="flex gap-2 sm:gap-3 justify-center my-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="otp-box w-10 h-10 sm:w-12 sm:h-12 text-center text-lg sm:text-xl font-bold border-2 border-gray-300 rounded-lg bg-white transition-all"
          aria-label={`OTP digit ${i + 1}`}
        />
      ))}
    </div>
  );
}

// ── Password Strength ──────────────────────────────────────────────────────────
function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const levels = [
    { label: "Very Weak", color: "bg-red-500" },
    { label: "Weak", color: "bg-orange-400" },
    { label: "Fair", color: "bg-yellow-400" },
    { label: "Good", color: "bg-blue-400" },
    { label: "Strong", color: "bg-green-500" },
  ];
  const level = levels[Math.min(score, 4)];

  return (
    <div className="mt-1">
      <div className="flex gap-1 h-1.5">
        {levels.map((l, i) => (
          <div
            key={i}
            className={`flex-1 rounded-full ${i <= score - 1 ? level.color : "bg-gray-200"}`}
          />
        ))}
      </div>
      <p className="text-xs mt-1 text-gray-500">
        Password strength:{" "}
        <span className={`font-semibold ${score <= 1 ? "text-red-500" : score <= 2 ? "text-orange-400" : score <= 3 ? "text-yellow-500" : "text-green-600"}`}>
          {level.label}
        </span>
      </p>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function RegistrationPage() {
  const [step, setStep] = useState<Step>("instructions");
  const [markedAsRead, setMarkedAsRead] = useState(false);

  // Identity step
  const [rollno, setRollno] = useState("");
  const [email, setEmail] = useState("");
  const [identityError, setIdentityError] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  // OTP step
  const [otpDigits, setOtpDigits] = useState(Array(6).fill(""));
  const [otpError, setOtpError] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // OTP countdown timer (seconds remaining; 0 means expired / no active timer)
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startOtpTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setOtpSecondsLeft(5 * 60);
    timerRef.current = setInterval(() => {
      setOtpSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Password step
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSendOtp = useCallback(async () => {
    setIdentityError("");
    const rollErr = validateRollno(rollno);
    if (rollErr) { setIdentityError(rollErr); return; }
    const emailErr = validateEmail(email);
    if (emailErr) { setIdentityError(emailErr); return; }
    if (!rollnoMatchesEmail(rollno, email)) {
      setIdentityError("Roll number does not match the number in your email ID.");
      return;
    }

    setSendingOtp(true);
    try {
      const res = await fetch("/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, rollno }),
      });
      const data = await res.json();
      if (!res.ok) { setIdentityError(data.error ?? "Failed to send OTP."); return; }
      setOtpSent(true);
      setOtpDigits(Array(6).fill(""));
      setOtpError("");
      startOtpTimer();
      setStep("otp");
    } catch {
      setIdentityError("Network error. Please try again.");
    } finally {
      setSendingOtp(false);
    }
  }, [email, rollno, startOtpTimer]);

  const handleVerifyOtp = useCallback(async (overrideOtp?: string) => {
    setOtpError("");
    const otp = overrideOtp ?? otpDigits.join("");
    if (otp.length < 6) { setOtpError("Please enter all 6 digits of the OTP."); return; }

    setVerifyingOtp(true);
    try {
      const res = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.error ?? "Invalid OTP.");
        setOtpDigits(Array(6).fill("")); // clear for re-entry (also re-focuses box 1)
        return;
      }
      setStep("password");
    } catch {
      setOtpError("Network error. Please try again.");
      setOtpDigits(Array(6).fill(""));
    } finally {
      setVerifyingOtp(false);
    }
  }, [email, otpDigits]);

  const handleSetPassword = useCallback(async () => {
    setPasswordError("");
    if (!password) { setPasswordError("Password cannot be empty."); return; }
    if (password.length < 8) { setPasswordError("Password must be at least 8 characters."); return; }
    if (password.length > 128) { setPasswordError("Password must be at most 128 characters."); return; }
    if (password !== confirmPassword) { setPasswordError("Passwords do not match."); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, rollno, password }),
      });
      const data = await res.json();
      if (!res.ok) { setPasswordError(data.error ?? "Failed to save password."); return; }
      setSubmitSuccess(true);
      setTimeout(() => setStep("success"), 1200);
    } catch {
      setPasswordError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [email, rollno, password, confirmPassword]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen flex items-start sm:items-center justify-center sm:p-4">
      <div className="w-full max-w-2xl bg-white sm:rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-700 px-4 sm:px-6 py-4 sm:py-5 text-white">
          <h1 className="text-lg sm:text-xl font-bold">🔐 Account Registration – Password Setup</h1>
          <p className="text-blue-200 text-sm mt-1">SXCCE Student Portal</p>
        </div>

        <div className="px-4 sm:px-6 py-4 sm:py-6">
          <StepIndicator current={step} />

          {/* ── Step 1: Instructions ── */}
          {step === "instructions" && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-4 max-h-[280px] sm:max-h-[420px] overflow-y-auto text-sm text-gray-700">
                <h2 className="text-base font-bold text-blue-800">
                  Welcome to the Account Setup Portal
                </h2>
                <p>Please follow the steps below carefully to complete your registration.</p>

                <div>
                  <p className="font-semibold text-blue-700">📌 Step 1: Enter Your College Email ID</p>
                  <ul className="list-disc ml-5 mt-1 space-y-1">
                    <li>Enter your official college email ID.</li>
                    <li>The email must end with: <code className="bg-gray-100 px-1 rounded">@sxcce.edu.in</code></li>
                    <li>The format must be: <code className="bg-gray-100 px-1 rounded">yourfirstname.rollnumber@sxcce.edu.in</code></li>
                    <li>Example: <code className="bg-gray-100 px-1 rounded">astlin.123456@sxcce.edu.in</code></li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold text-blue-700">📌 Step 2: Enter Your Roll Number</p>
                  <ul className="list-disc ml-5 mt-1 space-y-1">
                    <li>Enter your official roll number (numbers only).</li>
                    <li>It must be <strong>exactly 6 digits</strong> and match the roll number in your email ID.</li>
                    <li>Example — Email: <code className="bg-gray-100 px-1 rounded">astlin.123456@sxcce.edu.in</code> → Roll Number: <code className="bg-gray-100 px-1 rounded">123456</code></li>
                  </ul>
                  <p className="mt-1 text-orange-600 text-xs">⚠️ If the roll number does not match your email, you will not be allowed to proceed.</p>
                </div>

                <div>
                  <p className="font-semibold text-blue-700">📌 Step 3: OTP Verification</p>
                  <ul className="list-disc ml-5 mt-1 space-y-1">
                    <li>An OTP will be sent to your college email after successful verification.</li>
                    <li>Check your inbox (and spam folder if necessary).</li>
                    <li>The OTP is valid for <strong>5 minutes</strong>.</li>
                    <li>If expired, you may request a new OTP.</li>
                  </ul>
                  <p className="mt-1 text-red-600 text-xs">⚠️ Do not share your OTP with anyone.</p>
                </div>

                <div>
                  <p className="font-semibold text-blue-700">📌 Step 4: Create Your Password</p>
                  <ul className="list-disc ml-5 mt-1 space-y-1">
                    <li>Your password must be <strong>at least 8 characters</strong>.</li>
                    <li>For better security, use a mix of uppercase, lowercase, numbers, and special characters.</li>
                    <li>Choose a password easy for you to remember but hard for others to guess.</li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold text-blue-700">📌 Step 5: Confirm Your Password</p>
                  <ul className="list-disc ml-5 mt-1 space-y-1">
                    <li>Re-enter your password to confirm. Both must match exactly.</li>
                  </ul>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="font-semibold text-yellow-800">🔒 Important Notes</p>
                  <ul className="list-disc ml-5 mt-1 space-y-1 text-yellow-700">
                    <li>Use only your official college email ID.</li>
                    <li>Do not share your OTP or password with anyone.</li>
                    <li>This password will be used to access your student portal.</li>
                    <li>Remember your password for future logins.</li>
                  </ul>
                </div>

                <p className="text-gray-500 text-xs text-center">
                  If you face any issues, contact{" "}
                  <a
                    href="https://astlindijo.vercel.app/#contact"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600"
                  >
                    @astlin_dijo
                  </a>
                </p>
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={markedAsRead}
                  onChange={(e) => setMarkedAsRead(e.target.checked)}
                  className="w-5 h-5 accent-blue-600 cursor-pointer"
                />
                <span className="text-gray-700 text-sm font-medium">
                  ✅ Mark as Read – I have read and understood all the instructions above.
                </span>
              </label>

              <button
                onClick={() => setStep("identity")}
                disabled={!markedAsRead}
                className="w-full py-3 rounded-xl font-semibold text-white transition-all
                  bg-blue-600 hover:bg-blue-700 active:scale-95
                  disabled:bg-gray-300 disabled:cursor-not-allowed disabled:text-gray-500"
              >
                Continue →
              </button>
            </div>
          )}

          {/* ── Step 2: Identity ── */}
          {step === "identity" && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-800">Verify Your Identity</h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Roll Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="e.g. 123456"
                  enterKeyHint="next"
                  value={rollno}
                  onChange={(e) => setRollno(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
                />
                <p className="text-xs text-gray-400 mt-1">Digits only, exactly 6 digits</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  College Email ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  placeholder="yourfirstname.rollno@sxcce.edu.in"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="send"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
                />
                <p className="text-xs text-gray-400 mt-1">Must end with @sxcce.edu.in and include your roll number</p>
              </div>

              {identityError && (
                <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-2.5 text-sm">
                  ⚠️ {identityError}
                </div>
              )}

              {otpSent && (
                <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-2.5 text-sm">
                  ✅ OTP sent to <strong>{email}</strong>. Check your inbox (and spam folder).
                </div>
              )}

              <button
                onClick={handleSendOtp}
                disabled={sendingOtp || otpSecondsLeft > 0}
                className="w-full py-3 rounded-xl font-semibold text-white transition-all
                  bg-indigo-600 hover:bg-indigo-700 active:scale-95
                  disabled:bg-gray-300 disabled:cursor-not-allowed disabled:text-gray-500"
              >
                {sendingOtp
                  ? <span role="status" className="inline-flex items-center justify-center"><Spinner />Please wait…</span>
                  : otpSent && otpSecondsLeft > 0
                  ? `Resend OTP in ${String(Math.floor(otpSecondsLeft / 60)).padStart(2, "0")}:${String(otpSecondsLeft % 60).padStart(2, "0")}`
                  : otpSent ? "Resend OTP" : "Send OTP"}
              </button>
            </div>
          )}

          {/* ── Step 3: OTP ── */}
          {step === "otp" && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-800">OTP Verification</h2>
              <p className="text-sm text-gray-600">
                Enter the 6-digit OTP sent to <strong>{email}</strong>
              </p>

              <OtpInput
                value={otpDigits}
                onChange={setOtpDigits}
                onComplete={(otp) => { if (otpSecondsLeft > 0) handleVerifyOtp(otp); }}
              />

              {/* Countdown timer */}
              {otpSecondsLeft > 0 ? (
                <div
                  aria-live="polite"
                  aria-atomic="true"
                  className="flex items-center justify-center gap-2 bg-lime-50 border border-lime-300 text-lime-700 rounded-lg px-4 py-2.5 text-sm font-medium"
                >
                  <span aria-hidden="true">⏱</span>
                  <span>
                    OTP expires in{" "}
                    <strong>
                      {String(Math.floor(otpSecondsLeft / 60)).padStart(2, "0")}:
                      {String(otpSecondsLeft % 60).padStart(2, "0")}
                    </strong>
                  </span>
                </div>
              ) : (
                <div
                  role="alert"
                  className="flex items-center justify-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-2.5 text-sm font-medium"
                >
                  ⚠️ OTP has expired. Please go back and request a new one.
                </div>
              )}

              {otpError && (
                <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-2.5 text-sm">
                  ⚠️ {otpError}
                </div>
              )}

              <button
                onClick={() => handleVerifyOtp()}
                disabled={verifyingOtp || otpSecondsLeft === 0}
                aria-label={otpSecondsLeft === 0 ? "Cannot verify: OTP has expired. Use the back button below to request a new one." : undefined}
                className="w-full py-3 rounded-xl font-semibold text-white transition-all
                  bg-blue-600 hover:bg-blue-700 active:scale-95
                  disabled:bg-gray-300 disabled:cursor-not-allowed disabled:text-gray-500"
              >
                {verifyingOtp ? <span role="status" className="inline-flex items-center justify-center"><Spinner />Please wait…</span> : "Continue →"}
              </button>

              <button
                onClick={() => { setStep("identity"); setOtpDigits(Array(6).fill("")); setOtpError(""); setIdentityError(""); }}
                disabled={otpSecondsLeft > 0}
                aria-label={otpSecondsLeft > 0 ? "Resend OTP is locked while the current OTP is still valid" : "Go back and resend OTP"}
                className="w-full py-3 text-sm text-gray-500 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {otpSecondsLeft > 0
                  ? `Resend available in ${String(Math.floor(otpSecondsLeft / 60)).padStart(2, "0")}:${String(otpSecondsLeft % 60).padStart(2, "0")}`
                  : "← Back / Resend OTP"}
              </button>
            </div>
          )}

          {/* ── Step 4: Password ── */}
          {step === "password" && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-800">Create Your Password</h2>
              <p className="text-sm text-gray-600">Choose a strong password for your student portal account.</p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    autoComplete="new-password"
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 pr-12 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "🙈" : "👁️"}
                  </button>
                </div>
                <PasswordStrength password={password} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    maxLength={128}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 pr-12 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                  >
                    {showConfirm ? "🙈" : "👁️"}
                  </button>
                </div>
                {confirmPassword && (
                  <p className={`text-xs mt-1 ${password === confirmPassword ? "text-green-600" : "text-red-500"}`}>
                    {password === confirmPassword ? "✓ Passwords match" : "✗ Passwords do not match"}
                  </p>
                )}
              </div>

              {passwordError && (
                <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-2.5 text-sm">
                  ⚠️ {passwordError}
                </div>
              )}

              <button
                onClick={handleSetPassword}
                disabled={submitting || submitSuccess}
                className={`w-full py-3 rounded-xl font-semibold text-white transition-all active:scale-95
                  ${submitSuccess
                    ? "bg-green-500 cursor-default"
                    : "bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed disabled:text-gray-500"
                  }`}
              >
                {submitting ? "Saving…" : submitSuccess ? "✅ Password Set!" : "Set Password"}
              </button>
            </div>
          )}

          {/* ── Step 5: Success ── */}
          {step === "success" && (
            <div className="flex flex-col items-center justify-center py-10 space-y-4 text-center">
              <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center animate-bounce">
                <span className="text-5xl">✅</span>
              </div>
              <h2 className="text-2xl font-bold text-green-700">Password Set Successfully!</h2>
              <p className="text-gray-600 max-w-sm">
                Your password has been set successfully. You can now use it to log in to your SXCCE student portal.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 text-sm text-blue-700">
                <p>🎓 Roll Number: <strong>{rollno}</strong></p>
                <p>📧 Email: <strong>{email}</strong></p>
              </div>
              <p className="text-xs text-gray-400 mt-4">
                Need help?{" "}
                <a href="https://astlindijo.vercel.app/#contact" target="_blank" rel="noopener noreferrer" className="text-blue-600">
                  @astlin_dijo
                </a>
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
