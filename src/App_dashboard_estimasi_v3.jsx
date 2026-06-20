import { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const currency = (value) => {
  const number = Math.round(Number(value) || 0);
  return new Intl.NumberFormat("id-ID").format(number);
};

const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return 0;
  return Number(String(value).replace(/[^0-9.-]/g, "")) || 0;
};

const emptyPart = () => ({ free: false, partNo: "", partName: "", qty: 1, price: 0 });
const emptySublet = () => ({ subletNo: "", subletName: "", qty: 1, price: 0 });
const emptyJasa = () => ({ free: false, pekerjaan: "", rate: 1, price: 0 });

const HISTORY_KEY = "estimasi_history_v3";
const formatDateTime = (value) => {
  try {
    return new Date(value).toLocaleString("id-ID");
  } catch {
    return value || "-";
  }
};

export default function App() {
  const pdfRef = useRef(null);
  const [activeTab, setActiveTab] = useState("profile");
  const [menuView, setMenuView] = useState("estimasi");
  const [editingId, setEditingId] = useState(null);
  const [history, setHistory] = useState([]);

  const [vehicle, setVehicle] = useState({ polisi: "", type: "", rangka: "", tahun: "" });
  const [customer, setCustomer] = useState({ nama: "", contact: "", phone: "", alamat: "" });
  const [staff, setStaff] = useState({ nama: "", jabatan: "", kepalaBengkel: "I Nengah Andika" });

  const [repairType, setRepairType] = useState("Pilih Type");
  const [parts, setParts] = useState([
    { free: false, partNo: "08880-85986", partName: "TMO 10W-30 SN 1L", qty: 4, price: 117000 },
    { free: false, partNo: "15601-BZ030", partName: "OIL FILTER", qty: 1, price: 30000 },
    { free: false, partNo: "GSKT1-FIXCL", partName: "GASKET OLI MESIN", qty: 1, price: 12000 },
  ]);
  const [sublets, setSublets] = useState([]);
  const [jasa, setJasa] = useState([{ free: false, pekerjaan: "S.KECIL FIL (X)", rate: 0.5, price: 256410 }]);

  const [discountOpen, setDiscountOpen] = useState(true);
  const [discPartPercent, setDiscPartPercent] = useState(0);
  const [discPartRp, setDiscPartRp] = useState(0);
  const [discJasaPercent, setDiscJasaPercent] = useState(0);
  const [discJasaRp, setDiscJasaRp] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch {
        setHistory([]);
      }
    }
  }, []);

  const persistHistory = (nextHistory) => {
    setHistory(nextHistory);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
  };

  const totals = useMemo(() => {
    const totalParts = parts.reduce((sum, item) => sum + (item.free ? 0 : toNumber(item.qty) * toNumber(item.price)), 0);
    const totalSublet = sublets.reduce((sum, item) => sum + toNumber(item.qty) * toNumber(item.price), 0);
    const totalJasa = jasa.reduce((sum, item) => sum + (item.free ? 0 : toNumber(item.rate) * toNumber(item.price)), 0);

    const partDiscount = totalParts * (toNumber(discPartPercent) / 100) + toNumber(discPartRp);
    const jasaDiscount = totalJasa * (toNumber(discJasaPercent) / 100) + toNumber(discJasaRp);

    const finalParts = Math.max(totalParts - partDiscount, 0);
    const finalJasa = Math.max(totalJasa - jasaDiscount, 0);
    const grandTotal = finalParts + totalSublet + finalJasa;

    return { totalParts, totalSublet, totalJasa, partDiscount, jasaDiscount, finalParts, finalJasa, grandTotal };
  }, [parts, sublets, jasa, discPartPercent, discPartRp, discJasaPercent, discJasaRp]);

  const updateRow = (setter, index, field, value) => {
    setter((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const removeRow = (setter, index) => {
    setter((rows) => rows.filter((_, i) => i !== index));
  };

  const buildEstimateData = () => ({
    vehicle,
    customer,
    staff,
    repairType,
    parts,
    sublets,
    jasa,
    discounts: {
      discPartPercent,
      discPartRp,
      discJasaPercent,
      discJasaRp,
    },
    totals,
  });

  const saveEstimateToHistory = () => {
    const now = new Date().toISOString();
    const id = editingId || `EST-${Date.now()}`;
    const data = {
      id,
      createdAt: editingId ? history.find((x) => x.id === editingId)?.createdAt || now : now,
      updatedAt: now,
      title: `${vehicle.polisi || "Tanpa No Polisi"} - ${customer.nama || "Tanpa Nama"}`,
      data: buildEstimateData(),
    };

    const exists = history.some((x) => x.id === id);
    const nextHistory = exists
      ? history.map((x) => (x.id === id ? data : x))
      : [data, ...history];

    persistHistory(nextHistory);
    setEditingId(id);
    return id;
  };

  const loadEstimate = (item) => {
    const data = item.data || {};
    setVehicle(data.vehicle || { polisi: "", type: "", rangka: "", tahun: "" });
    setCustomer(data.customer || { nama: "", contact: "", phone: "", alamat: "" });
    setStaff(data.staff || { nama: "", jabatan: "", kepalaBengkel: "I Nengah Andika" });
    setRepairType(data.repairType || "Pilih Type");
    setParts(data.parts || []);
    setSublets(data.sublets || []);
    setJasa(data.jasa || []);
    setDiscPartPercent(data.discounts?.discPartPercent || 0);
    setDiscPartRp(data.discounts?.discPartRp || 0);
    setDiscJasaPercent(data.discounts?.discJasaPercent || 0);
    setDiscJasaRp(data.discounts?.discJasaRp || 0);
    setEditingId(item.id);
    setMenuView("estimasi");
    setActiveTab("estimasi");
  };

  const deleteHistory = (id) => {
    if (!confirm("Hapus history estimasi ini?")) return;
    const nextHistory = history.filter((x) => x.id !== id);
    persistHistory(nextHistory);
    if (editingId === id) setEditingId(null);
  };

  const newEstimate = () => {
    setEditingId(null);
    resetAll();
    setMenuView("estimasi");
    setActiveTab("profile");
  };

  const createImage = async () => {
    saveEstimateToHistory();
    const node = pdfRef.current;
    if (!node) return;
    const canvas = await html2canvas(node, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
    const link = document.createElement("a");
    link.download = "estimasi.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const createPDF = async () => {
    saveEstimateToHistory();
    const node = pdfRef.current;
    if (!node) return;
    const canvas = await html2canvas(node, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 8;
    const imgWidth = pageWidth - margin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let y = margin;
    let remaining = imgHeight;

    pdf.addImage(imgData, "PNG", margin, y, imgWidth, imgHeight);
    remaining -= pageHeight - margin * 2;

    while (remaining > 0) {
      pdf.addPage();
      y = margin - (imgHeight - remaining);
      pdf.addImage(imgData, "PNG", margin, y, imgWidth, imgHeight);
      remaining -= pageHeight - margin * 2;
    }
    pdf.save("estimasi-biaya.pdf");
  };

  const resetAll = () => {
    setVehicle({ polisi: "", type: "", rangka: "", tahun: "" });
    setCustomer({ nama: "", contact: "", phone: "", alamat: "" });
    setStaff({ nama: "", jabatan: "", kepalaBengkel: "I Nengah Andika" });
    setParts([]);
    setSublets([]);
    setJasa([]);
    setDiscPartPercent(0);
    setDiscPartRp(0);
    setDiscJasaPercent(0);
    setDiscJasaRp(0);
    setEditingId(null);
    setActiveTab("profile");
  };

  return (
    <div style={styles.page}>
      <aside style={styles.sidebar}>
        <div style={styles.logo}>WS</div>
        <button style={styles.sideItem}>⌂ Home</button>
        <div style={styles.sideGroup}>
          <div style={styles.sideTitle}>⚙ Estimasi ›</div>
          <button style={menuView === "estimasi" ? styles.subMenuActive : styles.subMenu} onClick={newEstimate}>▣ Buat Estimasi</button>
          <button style={menuView === "history" ? styles.subMenuActive : styles.subMenu} onClick={() => setMenuView("history")}>↻ History Estimasi</button>
        </div>
        <button style={styles.sideItem}>☁ CR7</button>
        <button style={styles.sideItem}>▦ Frontliner Activity</button>
        <button style={styles.sideItem}>☷ MRA Activity</button>
        <button style={styles.sideItem}>🔧 Tech. Activity</button>
        <button style={styles.sideItem}>↯ Monitoring</button>
        <button style={styles.logout}>↪ Logout</button>
      </aside>

      <main style={styles.mainContent}>
      {menuView === "estimasi" ? (
      <div style={styles.appShell}>
        <h2 style={styles.title}>FORM ESTIMASI</h2>

        <div style={styles.tabs}>
          <button style={activeTab === "profile" ? styles.tabActive : styles.tab} onClick={() => setActiveTab("profile")}>Profile</button>
          <button style={activeTab === "estimasi" ? styles.tabActive : styles.tab} onClick={() => setActiveTab("estimasi")}>Estimasi Biaya</button>
        </div>

        {activeTab === "profile" && (
          <section style={styles.card}>
            <h3 style={styles.sectionTitle}>🚙 Informasi Kendaraan</h3>
            <div style={styles.grid4}>
              <Field label="No Polisi *" value={vehicle.polisi} onChange={(v) => setVehicle({ ...vehicle, polisi: v })} placeholder="DK-XXX-XX" />
              <Field label="Type Kendaraan *" value={vehicle.type} onChange={(v) => setVehicle({ ...vehicle, type: v })} placeholder="PILIH TYPE KENDARAAN" />
              <Field label="No Rangka *" value={vehicle.rangka} onChange={(v) => setVehicle({ ...vehicle, rangka: v })} placeholder="MHFXXXXXX" />
              <Field label="Tahun *" value={vehicle.tahun} onChange={(v) => setVehicle({ ...vehicle, tahun: v })} placeholder="2XXX" />
            </div>

            <hr style={styles.hr} />
            <h3 style={styles.sectionTitle}>👤 Informasi Pelanggan</h3>
            <div style={styles.grid2}>
              <Field label="Nama Pelanggan *" value={customer.nama} onChange={(v) => setCustomer({ ...customer, nama: v })} placeholder="Nama Pelanggan" />
              <Field label="No Telepon" value={customer.phone} onChange={(v) => setCustomer({ ...customer, phone: v })} placeholder="628123456789" />
              <Field label="Contact Person" value={customer.contact} onChange={(v) => setCustomer({ ...customer, contact: v })} placeholder="Nama Contact Person" />
              <Field label="Alamat" value={customer.alamat} onChange={(v) => setCustomer({ ...customer, alamat: v })} placeholder="Alamat Lengkap" />
            </div>

            <hr style={styles.hr} />
            <h3 style={{ ...styles.sectionTitle, textAlign: "center" }}>▣ Informasi Pembuat Estimasi</h3>
            <div style={styles.grid3}>
              <SelectField label="Nama Staff *" value={staff.nama} onChange={(v) => setStaff({ ...staff, nama: v })} options={["", "Komang Ayu Wardani", "Pande Wira", "I Nengah Andika"]} />
              <Field label="Jabatan" value={staff.jabatan} onChange={(v) => setStaff({ ...staff, jabatan: v })} placeholder="Jabatan" />
              <Field label="Kepala Bengkel" value={staff.kepalaBengkel} onChange={(v) => setStaff({ ...staff, kepalaBengkel: v })} />
            </div>
          </section>
        )}

        {activeTab === "estimasi" && (
          <section style={styles.card}>
            <div style={styles.filterBox}>
              <b>Filter Paket Pekerjaan</b>
              <SelectField label="Repair Type" value={repairType} onChange={setRepairType} options={["Pilih Type", "Berkala", "General Repair", "Warranty", "T-Care", "Indorent", "TPI"]} />
            </div>

            <EditableTable title="🔧 Estimasi Parts" columns={["FREE", "PART NO", "PART NAME", "QTY", "PRICE", "TOTAL", "ACT"]}>
              {parts.map((item, index) => (
                <tr key={index}>
                  <td><input type="checkbox" checked={item.free} onChange={(e) => updateRow(setParts, index, "free", e.target.checked)} /></td>
                  <td><input style={styles.tableInput} value={item.partNo} onChange={(e) => updateRow(setParts, index, "partNo", e.target.value)} /></td>
                  <td><input style={styles.tableInput} value={item.partName} onChange={(e) => updateRow(setParts, index, "partName", e.target.value)} /></td>
                  <td><input style={styles.smallInput} type="number" value={item.qty} onChange={(e) => updateRow(setParts, index, "qty", e.target.value)} /></td>
                  <td><input style={styles.moneyInput} type="number" value={item.price} onChange={(e) => updateRow(setParts, index, "price", e.target.value)} /></td>
                  <td><input style={styles.totalInput} readOnly value={item.free ? "FREE" : currency(toNumber(item.qty) * toNumber(item.price))} /></td>
                  <td><button style={styles.trash} onClick={() => removeRow(setParts, index)}>🗑</button></td>
                </tr>
              ))}
            </EditableTable>
            <div style={styles.rowBetween}><button style={styles.smallBtn} onClick={() => setParts([...parts, emptyPart()])}>⊕ Add Part</button><button style={styles.greenSmall}>♻ Add from Image</button></div>

            <EditableTable title="🛠 Estimasi Sublet / Additional Job" columns={["SUBLET NO", "SUBLET NAME", "QTY", "PRICE", "TOTAL", "ACT"]}>
              {sublets.map((item, index) => (
                <tr key={index}>
                  <td><input style={styles.tableInput} value={item.subletNo} onChange={(e) => updateRow(setSublets, index, "subletNo", e.target.value)} /></td>
                  <td><input style={styles.tableInput} value={item.subletName} onChange={(e) => updateRow(setSublets, index, "subletName", e.target.value)} /></td>
                  <td><input style={styles.smallInput} type="number" value={item.qty} onChange={(e) => updateRow(setSublets, index, "qty", e.target.value)} /></td>
                  <td><input style={styles.moneyInput} type="number" value={item.price} onChange={(e) => updateRow(setSublets, index, "price", e.target.value)} /></td>
                  <td><input style={styles.totalInput} readOnly value={currency(toNumber(item.qty) * toNumber(item.price))} /></td>
                  <td><button style={styles.trash} onClick={() => removeRow(setSublets, index)}>🗑</button></td>
                </tr>
              ))}
            </EditableTable>
            <button style={styles.smallBtn} onClick={() => setSublets([...sublets, emptySublet()])}>⊕ Add Sublet</button>

            <EditableTable title="🧰 Jasa Pekerjaan" columns={["FREE", "PEKERJAAN", "RATE", "PRICE", "TOTAL", "ACT"]}>
              {jasa.map((item, index) => (
                <tr key={index}>
                  <td><input type="checkbox" checked={item.free} onChange={(e) => updateRow(setJasa, index, "free", e.target.checked)} /></td>
                  <td><input style={styles.tableInput} value={item.pekerjaan} onChange={(e) => updateRow(setJasa, index, "pekerjaan", e.target.value)} /></td>
                  <td><input style={styles.smallInput} type="number" value={item.rate} onChange={(e) => updateRow(setJasa, index, "rate", e.target.value)} /></td>
                  <td><input style={styles.moneyInput} type="number" value={item.price} onChange={(e) => updateRow(setJasa, index, "price", e.target.value)} /></td>
                  <td><input style={styles.totalInput} readOnly value={item.free ? "FREE" : currency(toNumber(item.rate) * toNumber(item.price))} /></td>
                  <td><button style={styles.trash} onClick={() => removeRow(setJasa, index)}>🗑</button></td>
                </tr>
              ))}
            </EditableTable>
            <button style={styles.smallBtn} onClick={() => setJasa([...jasa, emptyJasa()])}>⊕ Add Jasa</button>

            <div style={styles.discountLine} onClick={() => setDiscountOpen(!discountOpen)}>{discountOpen ? "⊖ Remove Discount" : "⊕ Add Discount"}</div>
            {discountOpen && (
              <div style={styles.discountArea}>
                <div>
                  <DiscountInput label="Disc. Part (%)" value={discPartPercent} onChange={setDiscPartPercent} suffix="%" />
                  <DiscountInput label="Disc. Part (Rp)" value={discPartRp} onChange={setDiscPartRp} prefix="Rp" />
                  <DiscountInput label="Disc. Jasa (%)" value={discJasaPercent} onChange={setDiscJasaPercent} suffix="%" />
                  <DiscountInput label="Disc. Jasa (Rp)" value={discJasaRp} onChange={setDiscJasaRp} prefix="Rp" />
                </div>
                <Summary totals={totals} />
              </div>
            )}
          </section>
        )}

        <div style={styles.footerButtons}>
          <button style={styles.resetBtn} onClick={resetAll}>↻ Reset</button>
          {editingId && <span style={styles.editBadge}>Sedang edit history: {editingId}</span>}
          <div style={{ flex: 1 }} />
          <button style={styles.saveBtn} onClick={saveEstimateToHistory}>Save History</button>
          <button style={styles.imageBtn} onClick={createImage}>Submit & Create Image ⊞</button>
          <button style={styles.pdfBtn} onClick={createPDF}>Submit & Create PDF ▣</button>
        </div>
      </div>
      ) : (
        <HistoryView history={history} onEdit={loadEstimate} onDelete={deleteHistory} onNew={newEstimate} />
      )}

      <div ref={pdfRef} style={styles.pdfPaper}>
        <h2 style={styles.pdfTitle}>FORM ESTIMASI BIAYA</h2>
        <div style={styles.pdfInfoGrid}>
          <PdfInfo title="DATA PELANGGAN" rows={[["Nama", customer.nama], ["Contact", customer.contact], ["Telepon", customer.phone], ["Alamat", customer.alamat]]} />
          <PdfInfo title="DATA KENDARAAN" rows={[["No Polisi", vehicle.polisi], ["Type", vehicle.type], ["No Rangka", vehicle.rangka], ["Tahun", vehicle.tahun]]} />
        </div>
        <PdfTable title="BERBAYAR / CHARGEABLE - PARTS" headers={["No", "Part No", "Part Name", "Qty", "Price", "Total"]} rows={parts.map((p, i) => [i + 1, p.partNo, p.partName, p.qty, p.free ? "FREE" : `Rp ${currency(p.price)}`, p.free ? "FREE" : `Rp ${currency(toNumber(p.qty) * toNumber(p.price))}`])} />
        <PdfTable title="SUBLET / ADDITIONAL JOB" headers={["No", "Sublet No", "Sublet Name", "Qty", "Price", "Total"]} rows={sublets.map((s, i) => [i + 1, s.subletNo, s.subletName, s.qty, `Rp ${currency(s.price)}`, `Rp ${currency(toNumber(s.qty) * toNumber(s.price))}`])} />
        <PdfTable title="JASA PEKERJAAN" headers={["No", "Pekerjaan", "Rate", "Price", "Total"]} rows={jasa.map((j, i) => [i + 1, j.pekerjaan, j.rate, j.free ? "FREE" : `Rp ${currency(j.price)}`, j.free ? "FREE" : `Rp ${currency(toNumber(j.rate) * toNumber(j.price))}`])} />
        <div style={styles.pdfTotals}>
          <div>Total Parts: Rp {currency(totals.totalParts)}</div>
          <div>Diskon Parts: Rp {currency(totals.partDiscount)}</div>
          <div>Total Sublet: Rp {currency(totals.totalSublet)}</div>
          <div>Total Jasa: Rp {currency(totals.totalJasa)}</div>
          <div>Diskon Jasa: Rp {currency(totals.jasaDiscount)}</div>
          <div style={styles.pdfGrand}>Grand Total: Rp {currency(totals.grandTotal)}</div>
        </div>
        <div style={styles.signatures}>
          <div><p>Dibuat Oleh</p><br /><br /><b>{staff.nama || "________________"}</b><p>{staff.jabatan}</p></div>
          <div><p>Kepala Bengkel</p><br /><br /><b>{staff.kepalaBengkel}</b></div>
          <div><p>Pelanggan</p><br /><br /><b>________________</b></div>
        </div>
      </div>
      </main>
    </div>
  );
}


function HistoryView({ history, onEdit, onDelete, onNew }) {
  return (
    <div style={styles.historyShell}>
      <div style={styles.historyHeader}>
        <h2 style={{ margin: 0 }}>History Estimasi</h2>
        <button style={styles.imageBtn} onClick={onNew}>+ Buat Estimasi Baru</button>
      </div>

      <table style={styles.historyTable}>
        <thead>
          <tr>
            <th>No</th>
            <th>No Polisi</th>
            <th>Pelanggan</th>
            <th>Type Kendaraan</th>
            <th>Grand Total</th>
            <th>Dibuat</th>
            <th>Update</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {history.length ? history.map((item, index) => {
            const data = item.data || {};
            return (
              <tr key={item.id}>
                <td>{index + 1}</td>
                <td>{data.vehicle?.polisi || "-"}</td>
                <td>{data.customer?.nama || "-"}</td>
                <td>{data.vehicle?.type || "-"}</td>
                <td>Rp {currency(data.totals?.grandTotal || 0)}</td>
                <td>{formatDateTime(item.createdAt)}</td>
                <td>{formatDateTime(item.updatedAt)}</td>
                <td style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                  <button style={styles.editBtn} onClick={() => onEdit(item)}>Edit</button>
                  <button style={styles.deleteBtn} onClick={() => onDelete(item.id)}>Hapus</button>
                </td>
              </tr>
            );
          }) : (
            <tr>
              <td colSpan="8" style={{ padding: 20, textAlign: "center", color: "#777" }}>
                Belum ada history. Klik Submit / Save History setelah membuat estimasi.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Field({ label, value, onChange, placeholder = "" }) {
  return <label style={styles.label}>{label}<input style={styles.input} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></label>;
}

function SelectField({ label, value, onChange, options }) {
  return <label style={styles.label}>{label}<select style={styles.input} value={value} onChange={(e) => onChange(e.target.value)}>{options.map((x) => <option key={x} value={x}>{x || "Pilih Staff"}</option>)}</select></label>;
}

function EditableTable({ title, columns, children }) {
  return <div style={{ marginTop: 14 }}><h3 style={styles.tableTitle}>{title}</h3><table style={styles.editTable}><thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

function DiscountInput({ label, value, onChange, prefix = "", suffix = "" }) {
  return <div style={styles.discountRow}><span>{label}</span>{prefix && <span style={styles.addon}>{prefix}</span>}<input style={styles.discountInput} type="number" value={value} onChange={(e) => onChange(e.target.value)} />{suffix && <span style={styles.addon}>{suffix}</span>}</div>;
}

function Summary({ totals }) {
  return <div style={styles.summaryBox}>
    <SummaryRow label="Total Parts" value={totals.totalParts} />
    <SummaryRow label="Total Sublet" value={totals.totalSublet} />
    <SummaryRow label="Total Jasa" value={totals.totalJasa} />
    <SummaryRow label="Diskon Parts" value={totals.partDiscount} />
    <SummaryRow label="Diskon Jasa" value={totals.jasaDiscount} />
    <div style={styles.grandRow}><b>Grand Total</b><strong>Rp {currency(totals.grandTotal)}</strong></div>
  </div>;
}

function SummaryRow({ label, value }) {
  return <div style={styles.summaryRow}><span>{label}</span><input readOnly value={`Rp ${currency(value)}`} /></div>;
}

function PdfInfo({ title, rows }) {
  return <div><h4 style={styles.pdfSubTitle}>{title}</h4><table style={styles.infoTable}><tbody>{rows.map(([a, b]) => <tr key={a}><td>{a}</td><td>:</td><td>{b}</td></tr>)}</tbody></table></div>;
}

function PdfTable({ title, headers, rows }) {
  return <div style={{ marginTop: 18 }}><h3 style={styles.pdfTableTitle}>{title}</h3><table style={styles.pdfTable}><thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>) : <tr><td colSpan={headers.length}>-</td></tr>}</tbody></table></div>;
}

const styles = {
  page: { minHeight: "100vh", background: "#f2f2f2", padding: 8, fontFamily: "Arial, sans-serif", fontSize: 12, display: "flex", gap: 14 },
  sidebar: { width: 210, flexShrink: 0, background: "#fff", border: "1px solid #cfcfcf", borderRadius: 6, padding: 8, height: "fit-content", position: "sticky", top: 8 },
  logo: { width: 44, height: 44, border: "1px solid #5aa4ff", borderRadius: 8, color: "red", fontWeight: "bold", fontSize: 24, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  sideItem: { width: "100%", textAlign: "left", padding: "11px 10px", border: 0, background: "#fff", borderBottom: "1px solid #eee", cursor: "pointer" },
  sideGroup: { borderBottom: "1px solid #eee", paddingBottom: 6 },
  sideTitle: { padding: "11px 10px", background: "#eef1f5", fontWeight: "bold" },
  subMenu: { width: "100%", textAlign: "left", padding: "10px 18px", border: 0, background: "#fff", cursor: "pointer" },
  subMenuActive: { width: "100%", textAlign: "left", padding: "10px 18px", border: 0, background: "#0b3b88", color: "#fff", borderRadius: 4, cursor: "pointer" },
  logout: { width: "100%", textAlign: "left", padding: "12px 10px", border: 0, background: "#fff", color: "#ef4444", cursor: "pointer" },
  mainContent: { flex: 1, minWidth: 0 },
  appShell: { maxWidth: 960, margin: "0 auto", background: "#fff", border: "1px solid #aaa", borderRadius: 6, overflow: "hidden" },
  editBadge: { alignSelf: "center", background: "#fff7cc", border: "1px solid #ead675", padding: "8px 10px", borderRadius: 5, color: "#806000" },
  saveBtn: { background: "#0f766e", color: "#fff", border: 0, borderRadius: 5, padding: "12px 20px", cursor: "pointer", fontWeight: "bold" },
  historyShell: { maxWidth: 1050, margin: "0 auto", background: "#fff", border: "1px solid #aaa", borderRadius: 6, padding: 18 },
  historyHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  historyTable: { width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "center" },
  editBtn: { background: "#2563eb", color: "#fff", border: 0, borderRadius: 4, padding: "7px 12px", cursor: "pointer" },
  deleteBtn: { background: "#ef4444", color: "#fff", border: 0, borderRadius: 4, padding: "7px 12px", cursor: "pointer" },
  title: { textAlign: "center", margin: "12px 0", fontSize: 18 },
  tabs: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, padding: "0 12px 8px" },
  tab: { border: 0, background: "#ddd", height: 32, cursor: "pointer" },
  tabActive: { border: 0, background: "#d8eaff", height: 32, fontWeight: "bold", cursor: "pointer" },
  card: { border: "1px solid #bbb", margin: 12, padding: 14, borderRadius: 5, background: "#fff" },
  sectionTitle: { fontSize: 16, margin: "8px 0 16px" },
  grid4: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 18 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 },
  label: { display: "flex", flexDirection: "column", gap: 7, fontSize: 12, fontWeight: "bold" },
  input: { height: 34, border: "1px solid #aaa", borderRadius: 4, padding: "0 10px", fontSize: 13, background: "#fff" },
  hr: { border: 0, borderTop: "1px solid #bbb", margin: "18px 0" },
  filterBox: { border: "1px solid #a8b6c9", background: "#eef6ff", borderRadius: 4, padding: 10 },
  tableTitle: { margin: "8px 0", fontSize: 14 },
  editTable: { width: "100%", borderCollapse: "collapse", fontSize: 11 },
  tableInput: { width: "95%", height: 28, border: "1px solid #bbb", borderRadius: 4, padding: "0 8px" },
  smallInput: { width: 58, height: 28, border: "1px solid #bbb", borderRadius: 4, textAlign: "center" },
  moneyInput: { width: 100, height: 28, border: "1px solid #bbb", borderRadius: 4, textAlign: "right", paddingRight: 8 },
  totalInput: { width: 105, height: 28, border: "1px solid #ddd", borderRadius: 4, textAlign: "right", paddingRight: 8, background: "#eee", color: "#777", fontWeight: "bold" },
  trash: { border: 0, background: "transparent", cursor: "pointer" },
  rowBetween: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, borderBottom: "1px solid #aaa", paddingBottom: 12 },
  smallBtn: { border: "1px solid #aaa", background: "#fff", borderRadius: 4, padding: "7px 14px", cursor: "pointer", marginTop: 8 },
  greenSmall: { border: "1px solid #5dd88a", background: "#e8fff1", color: "#00853f", borderRadius: 4, padding: "7px 14px", cursor: "pointer" },
  discountLine: { color: "#004a9f", cursor: "pointer", margin: "18px 0 10px" },
  discountArea: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, alignItems: "start" },
  discountRow: { display: "grid", gridTemplateColumns: "115px auto 75px auto", alignItems: "center", gap: 4, marginBottom: 8 },
  discountInput: { height: 24, border: "1px solid #bbb", borderRadius: 4, textAlign: "right", paddingRight: 5 },
  addon: { background: "#eee", border: "1px solid #ddd", padding: "5px 7px", borderRadius: 4 },
  summaryBox: { display: "flex", flexDirection: "column", gap: 8 },
  summaryRow: { display: "grid", gridTemplateColumns: "1fr 170px", alignItems: "center", gap: 10 },
  grandRow: { display: "grid", gridTemplateColumns: "1fr 170px", alignItems: "center", gap: 10, borderTop: "1px solid #999", paddingTop: 10, fontSize: 15 },
  footerButtons: { display: "flex", gap: 10, padding: 12, borderTop: "1px solid #bbb", background: "#f8f8f8" },
  resetBtn: { background: "#ef4444", color: "#fff", border: 0, borderRadius: 5, padding: "12px 24px", cursor: "pointer" },
  imageBtn: { background: "#16a34a", color: "#fff", border: 0, borderRadius: 5, padding: "12px 24px", cursor: "pointer", fontWeight: "bold" },
  pdfBtn: { background: "#1d4ed8", color: "#fff", border: 0, borderRadius: 5, padding: "12px 24px", cursor: "pointer", fontWeight: "bold" },
  pdfPaper: { width: 794, margin: "22px auto", background: "#fff", padding: 34, color: "#000", fontFamily: "Arial, sans-serif", fontSize: 12, boxSizing: "border-box" },
  pdfTitle: { textAlign: "center", fontSize: 24, marginBottom: 20 },
  pdfInfoGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30 },
  pdfSubTitle: { background: "#eaf2ff", padding: 7, margin: 0 },
  infoTable: { width: "100%", borderCollapse: "collapse", lineHeight: "22px" },
  pdfTableTitle: { textAlign: "center", fontSize: 16, margin: "8px 0" },
  pdfTable: { width: "100%", borderCollapse: "collapse", textAlign: "center", fontSize: 12, lineHeight: "20px" },
  pdfTotals: { marginTop: 18, marginLeft: "auto", width: 300, textAlign: "right", lineHeight: "24px" },
  pdfGrand: { borderTop: "1px solid #000", marginTop: 6, paddingTop: 6, fontSize: 16, fontWeight: "bold" },
  signatures: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", textAlign: "center", marginTop: 35 },
};
