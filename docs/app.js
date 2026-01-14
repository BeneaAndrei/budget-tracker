import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc,
  onSnapshot, orderBy, query, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// 🔥 Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDs25NM-Y-Kh1FjGSkyDPuBBNmcAMMmCXQ",
  authDomain: "budget-tracker-47be6.firebaseapp.com",
  projectId: "budget-tracker-47be6",
  storageBucket: "budget-tracker-47be6.firebasestorage.app",
  messagingSenderId: "828971238295",
  appId: "1:828971238295:web:ba228f1bf988f8f6f8fad2",
  measurementId: "G-K05QYLVYZZ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- STATE ----------
let uid = null;
let income = [];
let payments = [];
let forecast = { grossMonthly: 0 };
const taxRate = 0.10;

// ---------- HELPERS ----------
const $ = id => document.getElementById(id);
const monthOf = d => d.slice(0, 7);
const eur = v => `${v.toFixed(2)} €`;

function monthsBack(n) {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setMonth(d.getMonth() - i);
    out.push(x.toISOString().slice(0, 7));
  }
  return out;
}

function paymentForMonth(p, m) {
  if (m < p.startMonth) return 0;
  if (p.type === "ONE_OFF") return m === p.startMonth ? p.amount : 0;
  if (p.type === "FIXED_MONTHLY")
    return !p.endMonth || m <= p.endMonth ? p.amount : 0;
  if (p.type === "SPREAD" && p.endMonth) {
    const count = (new Date(p.endMonth) - new Date(p.startMonth)) / 2629800000 + 1;
    return m <= p.endMonth ? p.amountTotal / count : 0;
  }
  return 0;
}

// ---------- AUTH ----------
$("googleBtn").onclick = async () => {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
};

$("logoutBtn").onclick = () => signOut(auth);

onAuthStateChanged(auth, async user => {
  if (!user) {
    $("authScreen").classList.remove("hidden");
    $("app").classList.add("hidden");
    $("userBar").classList.add("hidden");
    return;
  }
  try {
    uid = user.uid;
    $("userEmail").textContent = user.email;
    $("authScreen").classList.add("hidden");
    $("app").classList.remove("hidden");
    $("userBar").classList.remove("hidden");

    const f = await getDoc(doc(db, "users", uid, "forecast", "main"));
    if (f.exists()) forecast = f.data();

    onSnapshot(query(collection(db, "users", uid, "income"), orderBy("date", "desc")),
      s => { 
        income = s.docs.map(d => ({ id: d.id, ...d.data() })); 
        render(); 
      });

    onSnapshot(collection(db, "users", uid, "payments"),
      s => { 
        payments = s.docs.map(d => ({ id: d.id, ...d.data() })); 
        render(); 
      });
  } catch (err) {
    alert("Error initializing app: " + err.message);
  }
});

// ---------- FORMS ----------
$("incomeForm").onsubmit = async e => {
  e.preventDefault();
  try {
    await addDoc(collection(db, "users", uid, "income"), {
      amount: +incomeAmount.value,
      date: incomeDate.value,
      source: incomeSource.value
    });
    e.target.reset();
  } catch (err) {
    alert("Error adding income: " + err.message);
  }
};

$("paymentForm").onsubmit = async e => {
  e.preventDefault();
  try {
    const p = {
      title: payTitle.value,
      type: payType.value,
      startMonth: payStart.value,
      endMonth: payEnd.value || null
    };
    if (p.type === "SPREAD") p.amountTotal = +payAmount.value;
    else p.amount = +payAmount.value;

    await addDoc(collection(db, "users", uid, "payments"), p);
    e.target.reset();
  } catch (err) {
    alert("Error adding payment: " + err.message);
  }
};

$("saveForecastBtn").onclick = async () => {
  try {
    forecast.grossMonthly = +forecastGross.value;
    await setDoc(doc(db, "users", uid, "forecast", "main"), forecast);
    render();
  } catch (err) {
    alert("Error saving forecast: " + err.message);
  }
};

// ---------- TAB SWITCHING ----------
document.querySelectorAll(".tab").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tabpage").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    const tabId = btn.getAttribute("data-tab");
    $(tabId).classList.add("active");
  };
});

// ---------- DELETE FUNCTIONS ----------
async function deleteIncome(idx) {
  try {
    const docId = income[idx].id || income[idx].docId;
    if (!docId) return alert("Cannot delete: missing document ID");
    await deleteDoc(doc(db, "users", uid, "income", docId));
  } catch (err) {
    alert("Error deleting income: " + err.message);
  }
}

async function deletePayment(idx) {
  try {
    const docId = payments[idx].id || payments[idx].docId;
    if (!docId) return alert("Cannot delete: missing document ID");
    await deleteDoc(doc(db, "users", uid, "payments", docId));
  } catch (err) {
    alert("Error deleting payment: " + err.message);
  }
}

// ---------- RENDER ----------
function render() {
  const months = monthsBack(12);
  const rows = months.map(m => {
    const netIn = income
      .filter(i => monthOf(i.date) === m)
      .reduce((a, i) => a + i.amount * (1 - taxRate), 0);

    const out = payments.reduce((a, p) => a + paymentForMonth(p, m), 0);
    return { m, netIn, out, bal: netIn - out };
  });

  kpiNetIn.textContent = eur(rows.reduce((a, r) => a + r.netIn, 0));
  kpiOut.textContent = eur(rows.reduce((a, r) => a + r.out, 0));
  kpiBal.textContent = eur(rows.reduce((a, r) => a + r.bal, 0));

  realityTable.innerHTML = `<div class="trow"><div><strong>Month</strong></div><div><strong>Net In</strong></div><div><strong>Out</strong></div><div><strong>Balance</strong></div></div>` +
    rows.map(r =>
    `<div class="trow">
      <div>${r.m}</div>
      <div>${eur(r.netIn)}</div>
      <div>${eur(r.out)}</div>
      <div>${eur(r.bal)}</div>
    </div>`
  ).join("");

  // Reality chart
  if (window.rc) window.rc.destroy();
  window.rc = new Chart(realityChart, {
    type: "line",
    data: {
      labels: rows.map(r => r.m),
      datasets: [
        { label: "Net In", data: rows.map(r => r.netIn), borderColor: "#667eea", tension: 0.3 },
        { label: "Out", data: rows.map(r => r.out), borderColor: "#f5576c", tension: 0.3 },
        { label: "Balance", data: rows.map(r => r.bal), borderColor: "#f093fb", tension: 0.3 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: true }
  });

  // Forecast chart
  const forecastMonths = monthsBack(12);
  const forecastRows = forecastMonths.map(m => {
    const netIn = forecast.grossMonthly * (1 - taxRate);
    const out = payments.reduce((a, p) => a + paymentForMonth(p, m), 0);
    return { m, netIn, out, bal: netIn - out };
  });

  if (window.fc) window.fc.destroy();
  window.fc = new Chart(forecastChart, {
    type: "line",
    data: {
      labels: forecastRows.map(r => r.m),
      datasets: [
        { label: "Expected In", data: forecastRows.map(r => r.netIn), borderColor: "#667eea", tension: 0.3 },
        { label: "Out", data: forecastRows.map(r => r.out), borderColor: "#f5576c", tension: 0.3 },
        { label: "Balance", data: forecastRows.map(r => r.bal), borderColor: "#f093fb", tension: 0.3 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: true }
  });

  forecastTable.innerHTML = `<div class="trow"><div><strong>Month</strong></div><div><strong>Expected In</strong></div><div><strong>Out</strong></div><div><strong>Balance</strong></div></div>` +
    forecastRows.map(r =>
    `<div class="trow">
      <div>${r.m}</div>
      <div>${eur(r.netIn)}</div>
      <div>${eur(r.out)}</div>
      <div>${eur(r.bal)}</div>
    </div>`
  ).join("");

  // Income list
  incomeList.innerHTML = income.map((i, idx) =>
    `<div class="list-item">
      <div class="list-item-text">
        <div><strong>${i.source}</strong></div>
        <div>${i.date} - ${eur(i.amount * (1 - taxRate))} net</div>
      </div>
      <button class="danger" onclick="deleteIncome(${idx})">Delete</button>
    </div>`
  ).join("");

  // Payments list
  paymentList.innerHTML = payments.map((p, idx) =>
    `<div class="list-item">
      <div class="list-item-text">
        <div><strong>${p.title}</strong></div>
        <div>${p.type} - ${p.startMonth}${p.endMonth ? ` to ${p.endMonth}` : ''}</div>
        <div>${eur(p.amount || p.amountTotal)}</div>
      </div>
      <button class="danger" onclick="deletePayment(${idx})">Delete</button>
    </div>`
  ).join("");
}
