// Database Client Configuration
const SUPABASE_PROJECT_URL = "https://twgdrkhzgkbuonlqdwlh.supabase.co";
const SUPABASE_ANON_KEY = "PASTE_YOUR_COPIED_ANON_KEY_HERE";

const supabaseClient = window.supabase.createClient(SUPABASE_PROJECT_URL, SUPABASE_ANON_KEY);
let currentUser = null;
let currentProfile = null;
let cachedData = { customers: [], loans: [], payments: [] };

async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    currentUser = session.user;
    await fetchProfile();
  } else {
    showAuth();
  }
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const alertBox = document.getElementById("login-alert");

  alertBox.classList.add("hidden");

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    alertBox.textContent = error.message;
    alertBox.classList.remove("hidden");
  } else {
    currentUser = data.user;
    await fetchProfile();
  }
});

async function fetchProfile() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  if (error || !data || !data.active) {
    alert("Account is inactive or profile does not exist.");
    await supabaseClient.auth.signOut();
    return showAuth();
  }

  currentProfile = data;
  document.getElementById("user-display-name").textContent = currentProfile.full_name;
  document.getElementById("user-display-role").textContent = currentProfile.role.replace("_", " ").toUpperCase();

  if (currentProfile.role === "super_admin") {
    document.querySelectorAll(".super-admin-only").forEach(el => el.classList.remove("hidden"));
  } else {
    document.querySelectorAll(".super-admin-only").forEach(el => el.classList.add("hidden"));
  }

  showApp();
  loadAllData();
}

function showAuth() {
  document.getElementById("auth-screen").classList.remove("hidden");
  document.getElementById("app-screen").classList.add("hidden");
}

function showApp() {
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("app-screen").classList.remove("hidden");
  document.getElementById("current-date-badge").textContent = new Date().toLocaleDateString("en-IN", {
    dateStyle: "long"
  });
}

document.getElementById("logout-btn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  location.reload();
});

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.getAttribute("data-page");
    document.querySelectorAll(".page-view").forEach(p => p.classList.add("hidden"));
    document.getElementById(`page-${target}`).classList.remove("hidden");
    document.getElementById("page-title").textContent = btn.textContent;
  });
});

async function loadAllData() {
  const [cRes, lRes, pRes] = await Promise.all([
    supabaseClient.from("customers").select("*").order("created_at", { ascending: false }),
    supabaseClient.from("loans").select("*, customers(name)").order("created_at", { ascending: false }),
    supabaseClient.from("payments").select("*, loans(loan_code, customers(name))").order("payment_date", { ascending: false })
  ]);

  cachedData.customers = cRes.data || [];
  cachedData.loans = lRes.data || [];
  cachedData.payments = pRes.data || [];

  renderDashboard();
  renderCustomers();
  renderLoans();
  renderPayments();
  populateDropdowns();
  if (currentProfile.role === "super_admin") renderAdmins();
}

function renderDashboard() {
  const totalCust = cachedData.customers.length;
  const totalLoans = cachedData.loans.length;
  let totalPrincipal = 0;
  let totalPayable = 0;
  let totalCollected = 0;

  cachedData.loans.forEach((l) => {
    totalPrincipal += parseFloat(l.principal);
    totalPayable += parseFloat(l.total_payable);
  });

  cachedData.payments.forEach((p) => {
    totalCollected += parseFloat(p.amount);
  });

  const outstanding = Math.max(0, totalPayable - totalCollected);

  document.getElementById("kpi-customers").textContent = totalCust;
  document.getElementById("kpi-loans").textContent = totalLoans;
  document.getElementById("kpi-principal").textContent = `₹${totalPrincipal.toLocaleString("en-IN")}`;
  document.getElementById("kpi-payable").textContent = `₹${totalPayable.toLocaleString("en-IN")}`;
  document.getElementById("kpi-collected").textContent = `₹${totalCollected.toLocaleString("en-IN")}`;
  document.getElementById("kpi-outstanding").textContent = `₹${outstanding.toLocaleString("en-IN")}`;
}

function getLoanFinancials(loanId) {
  const loan = cachedData.loans.find(l => l.id === loanId);
  if (!loan) return { payable: 0, paid: 0, outstanding: 0 };
  const paid = cachedData.payments
    .filter(p => p.loan_id === loanId)
    .reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const payable = parseFloat(loan.total_payable);
  const outstanding = Math.max(0, payable - paid);
  return { payable, paid, outstanding, status: outstanding === 0 ? "COMPLETED" : "ACTIVE" };
}

function renderCustomers() {
  const tbody = document.getElementById("customers-table-body");
  tbody.innerHTML = "";

  cachedData.customers.forEach((c) => {
    const custLoans = cachedData.loans.filter(l => l.customer_id === c.id);
    let custOutstanding = 0;
    custLoans.forEach(l => {
      const f = getLoanFinancials(l.id);
      custOutstanding += f.outstanding;
    });

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${c.customer_code}</strong></td>
      <td>${c.name}</td>
      <td>${c.mobile}</td>
      <td>${custLoans.length}</td>
      <td>₹${custOutstanding.toLocaleString("en-IN")}</td>
      <td><button class="btn btn-secondary" onclick="alert('Address: ${c.address || 'N/A'}\\nNotes: ${c.notes || 'None'}')">View Info</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderLoans() {
  const tbody = document.getElementById("loans-table-body");
  tbody.innerHTML = "";

  cachedData.loans.forEach((l) => {
    const f = getLoanFinancials(l.id);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${l.loan_code}</strong></td>
      <td>${l.customers?.name || "N/A"}</td>
      <td><span class="badge">${l.repayment_type.toUpperCase()} (${l.rate_percent}%)</span></td>
      <td>₹${parseFloat(l.principal).toLocaleString("en-IN")}</td>
      <td>₹${f.payable.toLocaleString("en-IN")}</td>
      <td>₹${f.paid.toLocaleString("en-IN")}</td>
      <td><strong>₹${f.outstanding.toLocaleString("en-IN")}</strong></td>
      <td><span class="badge ${f.status === 'COMPLETED' ? 'badge-success' : 'badge-warning'}">${f.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderPayments() {
  const tbody = document.getElementById("payments-table-body");
  tbody.innerHTML = "";

  cachedData.payments.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.payment_date}</td>
      <td>${p.loans?.customers?.name || "N/A"}</td>
      <td>${p.loans?.loan_code || "N/A"}</td>
      <td><strong>₹${parseFloat(p.amount).toLocaleString("en-IN")}</strong></td>
      <td>${p.method}</td>
      <td>${p.reference_no || "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

window.openModal = function (id) {
  document.getElementById(id).classList.remove("hidden");
};
window.closeModals = function () {
  document.querySelectorAll(".modal").forEach(m => m.classList.add("hidden"));
};

document.getElementById("add-customer-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("cust-name").value.trim();
  const mobile = document.getElementById("cust-mobile").value.trim();
  const address = document.getElementById("cust-address").value.trim();
  const notes = document.getElementById("cust-notes").value.trim();

  const { error } = await supabaseClient.from("customers").insert([
    { name, mobile, address, notes, created_by: currentUser.id }
  ]);

  if (error) alert("Error adding customer: " + error.message);
  else {
    window.closeModals();
    e.target.reset();
    loadAllData();
  }
});

function updateLoanPreview() {
  const principal = parseFloat(document.getElementById("loan-principal").value) || 0;
  const type = document.getElementById("loan-type-select").value;
  const rate = type === "daily" ? 20 : 26;
  const payable = type === "daily" ? principal * 1.20 : principal * 1.26;

  document.getElementById("preview-rate").textContent = `${rate}%`;
  document.getElementById("preview-payable").textContent = `₹${payable.toLocaleString("en-IN")}`;
}
document.getElementById("loan-principal").addEventListener("input", updateLoanPreview);
document.getElementById("loan-type-select").addEventListener("change", updateLoanPreview);

document.getElementById("add-loan-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const customer_id = document.getElementById("loan-cust-select").value;
  const principal = parseFloat(document.getElementById("loan-principal").value);
  const repayment_type = document.getElementById("loan-type-select").value;
  const loan_date = document.getElementById("loan-date").value;

  const { error } = await supabaseClient.from("loans").insert([
    { customer_id, principal, repayment_type, loan_date, created_by: currentUser.id }
  ]);

  if (error) alert("Error issuing loan: " + error.message);
  else {
    window.closeModals();
    e.target.reset();
    loadAllData();
  }
});

function populateDropdowns() {
  const custSelect = document.getElementById("loan-cust-select");
  custSelect.innerHTML = "<option value=''>Select Customer</option>";
  cachedData.customers.forEach((c) => {
    custSelect.innerHTML += `<option value="${c.id}">${c.customer_code} - ${c.name}</option>`;
  });

  const loanSelect = document.getElementById("pay-loan-select");
  loanSelect.innerHTML = "<option value=''>Select Loan Account</option>";
  cachedData.loans.forEach((l) => {
    const f = getLoanFinancials(l.id);
    if (f.outstanding > 0) {
      loanSelect.innerHTML += `<option value="${l.id}">${l.loan_code} - ${l.customers?.name} (Bal: ₹${f.outstanding})</option>`;
    }
  });
}

document.getElementById("pay-loan-select").addEventListener("change", (e) => {
  const f = getLoanFinancials(e.target.value);
  document.getElementById("pay-prev-payable").textContent = `₹${f.payable.toLocaleString("en-IN")}`;
  document.getElementById("pay-prev-paid").textContent = `₹${f.paid.toLocaleString("en-IN")}`;
  document.getElementById("pay-prev-outstanding").textContent = `₹${f.outstanding.toLocaleString("en-IN")}`;
  document.getElementById("pay-amount").max = f.outstanding;
});

document.getElementById("add-payment-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const loan_id = document.getElementById("pay-loan-select").value;
  const amount = parseFloat(document.getElementById("pay-amount").value);
  const method = document.getElementById("pay-method").value;
  const reference_no = document.getElementById("pay-reference").value.trim();
  const payment_date = document.getElementById("pay-date").value;

  const f = getLoanFinancials(loan_id);
  if (amount <= 0 || amount > f.outstanding) {
    return alert(`Payment must be greater than 0 and cannot exceed ₹${f.outstanding}`);
  }

  const { error } = await supabaseClient.from("payments").insert([
    { loan_id, amount, method, reference_no, payment_date, created_by: currentUser.id }
  ]);

  if (error) alert("Payment failed: " + error.message);
  else {
    window.closeModals();
    e.target.reset();
    loadAllData();
  }
});

async function renderAdmins() {
  const { data: admins } = await supabaseClient.from("profiles").select("*").order("created_at");
  const tbody = document.getElementById("admins-table-body");
  tbody.innerHTML = "";

  (admins || []).forEach((adm) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${adm.full_name}</td>
      <td>${adm.email}</td>
      <td><span class="badge">${adm.role}</span></td>
      <td>${adm.active ? "Active" : "Disabled"}</td>
      <td>
        ${adm.role !== "super_admin" ? `
          <button class="btn btn-secondary" onclick="window.toggleAdminStatus('${adm.id}',${!adm.active})">
            ${adm.active ? "Disable" : "Enable"}
          </button>
        ` : "-"}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.toggleAdminStatus = async function (id, newStatus) {
  const { error } = await supabaseClient
    .from("profiles")
    .update({ active: newStatus })
    .eq("id", id);
  if (error) alert(error.message);
  else renderAdmins();
};

document.getElementById("add-admin-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const full_name = document.getElementById("admin-name").value.trim();
  const email = document.getElementById("admin-email").value.trim();
  const password = document.getElementById("admin-password").value;

  const { error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { full_name } }
  });

  if (error) alert(error.message);
  else {
    alert("Admin account registered successfully.");
    window.closeModals();
    e.target.reset();
    setTimeout(renderAdmins, 1500);
  }
});

function downloadCSV(filename, rows) {
  const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

window.exportCustomersCSV = function () {
  const headers = ["Customer ID", "Name", "Mobile", "Address"];
  const rows = [headers, ...cachedData.customers.map(c => [c.customer_code, `"${c.name}"`, c.mobile, `"${c.address || ''}"`])];
  downloadCSV("Godavari_Customers.csv", rows);
};

window.exportLoansCSV = function () {
  const headers = ["Loan ID", "Customer", "Type", "Principal", "Payable", "Status"];
  const rows = [headers, ...cachedData.loans.map(l => [l.loan_code, `"${l.customers?.name || ''}"`, l.repayment_type, l.principal, l.total_payable, getLoanFinancials(l.id).status])];
  downloadCSV("Godavari_Loans.csv", rows);
};

window.exportPaymentsCSV = function () {
  const headers = ["Date", "Customer", "Loan ID", "Amount", "Method", "Reference"];
  const rows = [headers, ...cachedData.payments.map(p => [p.payment_date, `"${p.loans?.customers?.name || ''}"`, p.loans?.loan_code || '', p.amount, p.method, p.reference_no || ''])];
  downloadCSV("Godavari_Payments.csv", rows);
};

// Start application
checkSession();