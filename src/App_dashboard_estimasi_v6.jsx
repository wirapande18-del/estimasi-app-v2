import { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import Tesseract from "tesseract.js";
import "./index.css";

const rupiah = (angka) => new Intl.NumberFormat("id-ID").format(Math.round(Number(angka) || 0));
const toNumber = (v) => Number(String(v || "").replace(/[^0-9]/g, "")) || 0;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
};
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

const defaultParts = [
  { partNo: "08880-85986", partName: "TMO 10W-30 SN 1L", price: 117000 },
  { partNo: "15601-BZ030", partName: "OIL FILTER", price: 30000 },
  { partNo: "GSKT1-FIXCL", partName: "GASKET OLI MESIN", price: 12000 },
];
const flatRateList = {
  "Tidak Ada": 0,
  "LGGC": 180930,
  "LCGC": 180930,
  "NEW ENTRY": 180930,
  "COM": 223110,
  "ECO": 256410,
  "PAS": 329670,
  "MEXL": 567210,
  "HEXL": 643800,
  "CBU": 643800,
  "LEXUS": 705960,
};
const flatRateOptions = Object.keys(flatRateList);

const emptyForm = {
  polisi: "", kendaraan: "", rangka: "", tahun: "", customer: "", contact: "", phone: "", alamat: "",
  staff: "Komang Ayu Wardani", jabatan: "", kepalaBengkel: "I Nengah Andika",
  parts: [], sublets: [], jasa: [], discPartPct: 0, discPartRp: 0, discJasaPct: 0, discJasaRp: 0,
};

export default function App() {
  const pdfRef = useRef(null);
  const filePartRef = useRef(null);
  const fileCustomerRef = useRef(null);
  const [page, setPage] = useState("estimasi");
  const [form, setForm] = useState(emptyForm);
  const [history, setHistory] = useState(() => load("estimasi_history_v5", []));
  const [partDb, setPartDb] = useState(() => load("sparepart_db_v5", defaultParts));
  const [customerDb, setCustomerDb] = useState(() => load("customer_db_v5", []));
  const [repairType, setRepairType] = useState("");

  useEffect(() => save("estimasi_history_v5", history), [history]);
  useEffect(() => save("sparepart_db_v5", partDb), [partDb]);
  useEffect(() => save("customer_db_v5", customerDb), [customerDb]);

  // Otomatis simpan data customer baru saat No Polisi sudah terisi.
  useEffect(() => {
    if (!form.polisi || (!form.customer && !form.kendaraan && !form.rangka && !form.phone && !form.alamat)) return;
    const data = {
      polisi: form.polisi, kendaraan: form.kendaraan, rangka: form.rangka, tahun: form.tahun,
      customer: form.customer, contact: form.contact, phone: form.phone, alamat: form.alamat,
    };
    setCustomerDb((prev) => {
      const key = form.polisi.replace(/\s|-/g, "").toUpperCase();
      const idx = prev.findIndex((x) => (x.polisi || "").replace(/\s|-/g, "").toUpperCase() === key);
      if (idx >= 0) return prev.map((x, i) => i === idx ? { ...x, ...data } : x);
      return [...prev, data];
    });
  }, [form.polisi, form.kendaraan, form.rangka, form.tahun, form.customer, form.contact, form.phone, form.alamat]);

  const totals = useMemo(() => {
    const totalParts = form.parts.reduce((a, b) => a + (Number(b.total) || 0), 0);
    const totalSublet = form.sublets.reduce((a, b) => a + (Number(b.total) || 0), 0);
    const totalJasa = form.jasa.reduce((a, b) => a + (Number(b.total) || 0), 0);

    // Rumus diskon sesuai permintaan:
    // Harga include PPN dibagi 1.11 dulu, sisa DPP dikalikan diskon,
    // setelah diskon baru ditambah PPN 11% lagi.
    const dppParts = totalParts / 1.11;
    const dppJasa = totalJasa / 1.11;

    const discParts = dppParts * ((Number(form.discPartPct) || 0) / 100) + (Number(form.discPartRp) || 0);
    const discJasa = dppJasa * ((Number(form.discJasaPct) || 0) / 100) + (Number(form.discJasaRp) || 0);

    const totalPartsAfterDisc = Math.max(dppParts - discParts, 0) * 1.11;
    const totalJasaAfterDisc = Math.max(dppJasa - discJasa, 0) * 1.11;
    const grandTotal = totalPartsAfterDisc + totalSublet + totalJasaAfterDisc;

    return { totalParts, totalSublet, totalJasa, dppParts, dppJasa, discParts, discJasa, totalPartsAfterDisc, totalJasaAfterDisc, grandTotal };
  }, [form]);

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const addPart = () => setForm((p) => ({ ...p, parts: [...p.parts, { id: uid(), free: false, partNo: "", partName: "", qty: 1, price: 0, total: 0 }] }));
  const addSublet = () => setForm((p) => ({ ...p, sublets: [...p.sublets, { id: uid(), subletNo: "", subletName: "", qty: 1, price: 0, total: 0 }] }));
  const addJasa = () => setForm((p) => ({ ...p, jasa: [...p.jasa, { id: uid(), free: false, jasaName: "", rate: 1, price: 0, total: 0 }] }));

  const handleFlatRateChange = (type) => {
    setRepairType(type);
    const price = flatRateList[type] || 0;
    setForm((p) => {
      const rows = p.jasa.length ? [...p.jasa] : [{ id: uid(), free: false, jasaName: "", rate: 1, price: 0, total: 0 }];
      const oldRate = Number(rows[0].rate) || 1;
      const rateValue = type === "Tidak Ada" ? oldRate : 1;
      rows[0] = {
        ...rows[0],
        jasaName: type === "Tidak Ada" ? rows[0].jasaName : type,
        rate: rateValue,
        price,
        total: rateValue * price,
      };
      return { ...p, jasa: rows };
    });
  };

  const updateRow = (type, id, key, value) => {
    setForm((p) => ({
      ...p,
      [type]: p[type].map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, [key]: value };
        if (type === "parts" && key === "partNo") {
          const found = partDb.find((x) => x.partNo.toUpperCase() === String(value).toUpperCase());
          if (found) { next.partName = found.partName; next.price = found.price; }
        }
        const qty = Number(next.qty || next.rate) || 0;
        const price = Number(next.price) || 0;
        next.total = qty * price;
        if (type === "parts" && next.partNo && (next.partName || next.price)) {
          const data = { partNo: next.partNo, partName: next.partName || "-", price: Number(next.price) || 0 };
          setPartDb((prevDb) => {
            const idx = prevDb.findIndex((x) => (x.partNo || "").toUpperCase() === data.partNo.toUpperCase());
            if (idx >= 0) return prevDb.map((x, i) => i === idx ? { ...x, ...data } : x);
            return [...prevDb, data];
          });
        }
        return next;
      }),
    }));
  };
  const deleteRow = (type, id) => setForm((p) => ({ ...p, [type]: p[type].filter((r) => r.id !== id) }));

  const findCustomerByPlate = (plate) => {
    const found = customerDb.find((c) => c.polisi.replace(/\s|-/g, "").toUpperCase() === plate.replace(/\s|-/g, "").toUpperCase());
    if (found) setForm((p) => ({ ...p, ...found }));
  };

  const saveMasterFromCurrent = () => {
    const newParts = [...partDb];
    form.parts.forEach((p) => {
      if (!p.partNo) return;
      const idx = newParts.findIndex((x) => x.partNo.toUpperCase() === p.partNo.toUpperCase());
      const data = { partNo: p.partNo, partName: p.partName, price: Number(p.price) || 0 };
      if (idx >= 0) newParts[idx] = data; else newParts.push(data);
    });
    setPartDb(newParts);
    if (form.polisi) {
      const data = { polisi: form.polisi, kendaraan: form.kendaraan, rangka: form.rangka, tahun: form.tahun, customer: form.customer, contact: form.contact, phone: form.phone, alamat: form.alamat };
      setCustomerDb((prev) => {
        const idx = prev.findIndex((x) => x.polisi.replace(/\s|-/g, "").toUpperCase() === form.polisi.replace(/\s|-/g, "").toUpperCase());
        if (idx >= 0) return prev.map((x, i) => i === idx ? data : x);
        return [...prev, data];
      });
    }
    alert("Database sparepart dan customer sudah disimpan.");
  };

  const saveHistory = () => {
    saveMasterFromCurrent();
    const data = { id: form.id || uid(), ...form, grandTotal: totals.grandTotal, createdAt: form.createdAt || new Date().toLocaleString("id-ID"), updatedAt: new Date().toLocaleString("id-ID") };
    setHistory((prev) => prev.some((x) => x.id === data.id) ? prev.map((x) => x.id === data.id ? data : x) : [data, ...prev]);
    setForm(data);
    alert("Estimasi masuk history dan bisa diedit lagi.");
  };

  const resetForm = () => setForm(emptyForm);
  const editHistory = (h) => { setForm(h); setPage("estimasi"); };

  const parsePartText = (text) => {
    const lines = text.split(/\n/).map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean);
    const result = [];
    for (const line of lines) {
      if (/part no|part name|retail price|stock|model/i.test(line)) continue;
      const partNo = (line.match(/\b[0-9A-Z]{5,}[-]?[0-9A-Z]{3,}\b/i) || [""])[0];
      const nums = line.match(/\b\d{1,3}(?:[,.]\d{3})+(?:[,.]\d{2})?|\b\d{5,9}\b/g) || [];
      if (!partNo || nums.length === 0) continue;
      let price = toNumber(nums[nums.length - 1]);
      if (price > 5000000) price = Math.round(price / 100);
      let name = line.replace(partNo, "").replace(nums[nums.length - 1], "").replace(/available|not available|retail price|stock depo|stock cpd/gi, "").replace(/\b\d+\b/g, "").trim() || "-";
      result.push({ id: uid(), free: false, partNo, partName: name, qty: 1, price, total: price });
    }
    return result;
  };

  const addPartsFromImage = async (file) => {
    if (!file) return;
    const res = await Tesseract.recognize(file, "eng");
    const rows = parsePartText(res.data.text);
    setForm((p) => ({ ...p, parts: [...p.parts, ...rows] }));
    setPartDb((prev) => {
      const db = [...prev]; rows.forEach((r) => { const i = db.findIndex((x) => x.partNo === r.partNo); const d = { partNo: r.partNo, partName: r.partName, price: r.price }; if (i >= 0) db[i] = d; else db.push(d); }); return db;
    });
    alert(`${rows.length} part berhasil dibaca dari gambar.`);
  };

  const handlePaste = async (e) => {
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
    if (item && page === "estimasi") addPartsFromImage(item.getAsFile());
  };

  const downloadPDF = async () => {
    saveHistory();
    const canvas = await html2canvas(pdfRef.current, { scale: 3, useCORS: true, scrollY: 0 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const imgWidth = 190;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, "PNG", 10, 8, imgWidth, imgHeight);
    pdf.save(`estimasi-${form.polisi || "baru"}.pdf`);
  };

  return <div onPaste={handlePaste} style={styles.app}>
    <aside style={styles.sidebar}><div style={styles.logo}>WS</div><div style={styles.nav}>⌂ Home</div><div style={styles.navActive}>⚙ Estimasi ›</div><button style={page==="estimasi"?styles.menuOn:styles.menu} onClick={()=>setPage("estimasi")}>▣ Buat Estimasi</button><button style={page==="history"?styles.menuOn:styles.menu} onClick={()=>setPage("history")}>↻ History Estimasi</button><button style={page==="sparepart"?styles.menuOn:styles.menu} onClick={()=>setPage("sparepart")}>🔧 Master Sparepart</button><button style={page==="customer"?styles.menuOn:styles.menu} onClick={()=>setPage("customer")}>👤 Master Customer</button></aside>
    <main style={styles.main}>{page==="estimasi" && <Estimasi form={form} setField={setField} addPart={addPart} updateRow={updateRow} deleteRow={deleteRow} addSublet={addSublet} addJasa={addJasa} totals={totals} repairType={repairType} setRepairType={setRepairType} handleFlatRateChange={handleFlatRateChange} partDb={partDb} findCustomerByPlate={findCustomerByPlate} saveMasterFromCurrent={saveMasterFromCurrent} saveHistory={saveHistory} downloadPDF={downloadPDF} resetForm={resetForm} filePartRef={filePartRef} addPartsFromImage={addPartsFromImage} pdfRef={pdfRef}/>} {page==="history" && <History history={history} editHistory={editHistory} setHistory={setHistory} newForm={() => {resetForm(); setPage("estimasi")}}/>} {page==="sparepart" && <MasterPart partDb={partDb} setPartDb={setPartDb}/>} {page==="customer" && <MasterCustomer customerDb={customerDb} setCustomerDb={setCustomerDb}/>}</main>
  </div>;
}

function Estimasi(p){ const f=p.form; return <><section style={styles.card}><h2 style={{textAlign:"center"}}>FORM ESTIMASI</h2><div style={styles.tabs}><b>Profile</b><b>Estimasi Biaya</b></div><h3>🚙 Informasi Kendaraan</h3><div style={styles.grid4}><Input label="No Polisi *" value={f.polisi} onChange={(v)=>{p.setField("polisi",v); p.findCustomerByPlate(v)}}/><Input label="Type Kendaraan *" value={f.kendaraan} onChange={(v)=>p.setField("kendaraan",v)}/><Input label="No Rangka *" value={f.rangka} onChange={(v)=>p.setField("rangka",v)}/><Input label="Tahun *" value={f.tahun} onChange={(v)=>p.setField("tahun",v)}/></div><h3>👤 Informasi Pelanggan</h3><div style={styles.grid2}><Input label="Nama Pelanggan *" value={f.customer} onChange={(v)=>p.setField("customer",v)}/><Input label="No Telepon" value={f.phone} onChange={(v)=>p.setField("phone",v)}/><Input label="Contact Person" value={f.contact} onChange={(v)=>p.setField("contact",v)}/><Input label="Alamat" value={f.alamat} onChange={(v)=>p.setField("alamat",v)}/></div><h3>▣ Informasi Pembuat Estimasi</h3><div style={styles.grid3}><Input label="Nama Staff *" value={f.staff} onChange={(v)=>p.setField("staff",v)}/><Input label="Jabatan" value={f.jabatan} onChange={(v)=>p.setField("jabatan",v)}/><Input label="Kepala Bengkel" value={f.kepalaBengkel} onChange={(v)=>p.setField("kepalaBengkel",v)}/></div></section>
  <section style={styles.card}><h3>🔧 Estimasi Parts</h3><table style={styles.table}><thead><tr><th>FREE</th><th>PART NO</th><th>PART NAME</th><th>QTY</th><th>PRICE</th><th>TOTAL</th><th>ACT</th></tr></thead><tbody>{f.parts.map(r=><tr key={r.id}><td><input type="checkbox" checked={r.free} onChange={(e)=>p.updateRow("parts",r.id,"free",e.target.checked)}/></td><td><input list="part-list" value={r.partNo} onChange={(e)=>p.updateRow("parts",r.id,"partNo",e.target.value)} style={styles.cellInput}/></td><td><input value={r.partName} onChange={(e)=>p.updateRow("parts",r.id,"partName",e.target.value)} style={styles.cellInput}/></td><td><input type="number" value={r.qty} onChange={(e)=>p.updateRow("parts",r.id,"qty",e.target.value)} style={styles.smallInput}/></td><td><input value={r.price} onChange={(e)=>p.updateRow("parts",r.id,"price",toNumber(e.target.value))} style={styles.cellInput}/></td><td><b>{rupiah(r.total)}</b></td><td><button onClick={()=>p.deleteRow("parts",r.id)} style={styles.del}>🗑</button></td></tr>)}</tbody></table><datalist id="part-list">{p.partDb.map(x=><option key={x.partNo} value={x.partNo}>{x.partName} - Rp {rupiah(x.price)}</option>)}</datalist><button onClick={p.addPart} style={styles.btn}>⊕ Add Part</button><button onClick={()=>p.filePartRef.current.click()} style={styles.green}>♻ Add from Image / Paste Foto</button><input ref={p.filePartRef} type="file" accept="image/*" hidden onChange={(e)=>p.addPartsFromImage(e.target.files[0])}/><small style={{display:"block",marginTop:8}}>Tips: bisa juga copy gambar tabel part lalu klik area aplikasi dan tekan Ctrl+V.</small><hr/>
  <h3>🔨 Estimasi Sublet / Additional Job</h3><EditableSimple rows={f.sublets} type="sublets" updateRow={p.updateRow} deleteRow={p.deleteRow} cols={["subletNo","subletName","qty","price"]}/><button onClick={p.addSublet} style={styles.btn}>⊕ Add Sublet</button><hr/><h3>🧰 Jasa Pekerjaan</h3><div style={styles.flatRateBox}><b>Flat Rate</b><span>Pilih Type</span><select value={p.repairType || "Tidak Ada"} onChange={(e)=>p.handleFlatRateChange(e.target.value)} style={styles.select}>{flatRateOptions.map(x=><option key={x} value={x}>{x}</option>)}</select><span>Flat Rate</span><input readOnly value={rupiah(flatRateList[p.repairType] || 0)} style={styles.flatRateInput}/></div><EditableSimple rows={f.jasa} type="jasa" updateRow={p.updateRow} deleteRow={p.deleteRow} cols={["jasaName","rate","price"]}/><button onClick={p.addJasa} style={styles.btn}>⊕ Add Jasa</button><div style={styles.discount}><Input label="Disc Part (%)" value={f.discPartPct} onChange={(v)=>p.setField("discPartPct",v)}/><Input label="Disc Part (Rp)" value={f.discPartRp} onChange={(v)=>p.setField("discPartRp",toNumber(v))}/><Input label="Disc Jasa (%)" value={f.discJasaPct} onChange={(v)=>p.setField("discJasaPct",v)}/><Input label="Disc Jasa (Rp)" value={f.discJasaRp} onChange={(v)=>p.setField("discJasaRp",toNumber(v))}/><div style={styles.totalBox}><p>Total Parts<br/><b>Rp {rupiah(p.totals.totalParts)}</b></p><p>Total Sublet<br/><b>Rp {rupiah(p.totals.totalSublet)}</b></p><p>Total Jasa<br/><b>Rp {rupiah(p.totals.totalJasa)}</b></p><b>Grand Total</b><h2>Rp {rupiah(p.totals.grandTotal)}</h2></div></div><div style={styles.actions}><button onClick={p.resetForm} style={styles.red}>↻ Reset</button><button onClick={p.saveMasterFromCurrent} style={styles.btn}>💾 Save Master</button><button onClick={p.saveHistory} style={styles.green}>Submit / Save History</button><button onClick={p.downloadPDF} style={styles.blue}>Submit & Create PDF</button></div></section><PDFView refx={p.pdfRef} form={f} totals={p.totals}/></> }
function EditableSimple({rows,type,updateRow,deleteRow,cols}){return <table style={styles.table}><tbody>{rows.map(r=><tr key={r.id}>{cols.map(c=><td key={c}><input value={r[c]||""} onChange={(e)=>updateRow(type,r.id,c,c.includes("price")?toNumber(e.target.value):e.target.value)} style={styles.cellInput} placeholder={c}/></td>)}<td><b>{rupiah(r.total)}</b></td><td><button onClick={()=>deleteRow(type,r.id)} style={styles.del}>🗑</button></td></tr>)}</tbody></table>}
function Input({label,value,onChange}){return <label style={styles.label}>{label}<input value={value||""} onChange={(e)=>onChange(e.target.value)} style={styles.input}/></label>}
function History({history,editHistory,setHistory,newForm}){return <section style={styles.card}><button style={styles.greenRight} onClick={newForm}>+ Buat Estimasi Baru</button><h1>History Estimasi</h1><table style={styles.table}><thead><tr><th>No</th><th>No Polisi</th><th>Pelanggan</th><th>Type</th><th>Grand Total</th><th>Dibuat</th><th>Update</th><th>Action</th></tr></thead><tbody>{history.length===0?<tr><td colSpan="8" style={{textAlign:"center",padding:30}}>Belum ada history.</td></tr>:history.map((h,i)=><tr key={h.id}><td>{i+1}</td><td>{h.polisi}</td><td>{h.customer}</td><td>{h.kendaraan}</td><td>Rp {rupiah(h.grandTotal)}</td><td>{h.createdAt}</td><td>{h.updatedAt}</td><td><button onClick={()=>editHistory(h)} style={styles.btn}>Edit</button><button onClick={()=>editHistory({...h,id:uid(),createdAt:new Date().toLocaleString("id-ID"),updatedAt:new Date().toLocaleString("id-ID")})} style={styles.btn}>Copy</button><button onClick={()=>setHistory(history.filter(x=>x.id!==h.id))} style={styles.del}>Hapus</button></td></tr>)}</tbody></table></section>}
function parseImportRows(text) {
  return String(text || "")
    .split(/\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((line) => line.split(/\t|;/).map((x) => x.trim()).filter((_, i, arr) => arr.length > 1 || i === 0));
}

function MasterPart({partDb,setPartDb}){
  const [bulk, setBulk] = useState("");
  const importBulk = () => {
    const rows = parseImportRows(bulk);
    const next = [...partDb];
    rows.forEach((cols) => {
      if (cols.length < 2) return;
      const [partNo, partName, priceRaw] = cols;
      if (/part\s*no/i.test(partNo)) return;
      const data = { partNo, partName, price: toNumber(priceRaw || 0) };
      if (!data.partNo) return;
      const idx = next.findIndex((x) => (x.partNo || "").toUpperCase() === data.partNo.toUpperCase());
      if (idx >= 0) next[idx] = { ...next[idx], ...data }; else next.push(data);
    });
    setPartDb(next);
    setBulk("");
    alert(`${rows.length} baris sparepart diproses.`);
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(partDb, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "master-sparepart.json"; a.click(); URL.revokeObjectURL(url);
  };
  return <section style={styles.card}><h1>Master Sparepart</h1>
    <p><b>Input banyak sekaligus:</b> copy dari Excel lalu paste di bawah. Format: Part No | Part Name | Price.</p>
    <textarea value={bulk} onChange={(e)=>setBulk(e.target.value)} placeholder={'Contoh dari Excel:\n08880-85986\tTMO 10W-30 SN 1L\t117000\n15601-BZ030\tOIL FILTER\t30000'} style={styles.bulkBox}/>
    <button style={styles.green} onClick={importBulk}>Import Sparepart Banyak</button>
    <button style={styles.btn} onClick={exportJson}>Export Backup</button>
    <button style={styles.btn} onClick={()=>setPartDb([...partDb,{partNo:"",partName:"",price:0}])}>+ Add Sparepart</button>
    <table style={styles.table}><thead><tr><th>Part No</th><th>Part Name</th><th>Price</th><th>Act</th></tr></thead><tbody>{partDb.map((p,i)=><tr key={i}><td><input value={p.partNo} onChange={e=>setPartDb(partDb.map((x,j)=>j===i?{...x,partNo:e.target.value}:x))} style={styles.cellInput}/></td><td><input value={p.partName} onChange={e=>setPartDb(partDb.map((x,j)=>j===i?{...x,partName:e.target.value}:x))} style={styles.cellInput}/></td><td><input value={p.price} onChange={e=>setPartDb(partDb.map((x,j)=>j===i?{...x,price:toNumber(e.target.value)}:x))} style={styles.cellInput}/></td><td><button style={styles.del} onClick={()=>setPartDb(partDb.filter((_,j)=>j!==i))}>Hapus</button></td></tr>)}</tbody></table></section>
}

function MasterCustomer({customerDb,setCustomerDb}){
  const [bulk, setBulk] = useState("");
  const importBulk = () => {
    const rows = parseImportRows(bulk);
    const next = [...customerDb];
    rows.forEach((cols) => {
      if (cols.length < 3) return;
      const [polisi, kendaraan, customer, alamat, rangka, phone] = cols;
      if (/police|polisi/i.test(polisi)) return;
      const data = { polisi, kendaraan, customer, alamat: alamat || "", rangka: rangka || "", phone: phone || "", contact: "", tahun: "" };
      if (!data.polisi) return;
      const key = data.polisi.replace(/\s|-/g, "").toUpperCase();
      const idx = next.findIndex((x) => (x.polisi || "").replace(/\s|-/g, "").toUpperCase() === key);
      if (idx >= 0) next[idx] = { ...next[idx], ...data }; else next.push(data);
    });
    setCustomerDb(next);
    setBulk("");
    alert(`${rows.length} baris customer diproses.`);
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(customerDb, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "master-customer.json"; a.click(); URL.revokeObjectURL(url);
  };
  return <section style={styles.card}><h1>Master Customer</h1>
    <p><b>Input banyak sekaligus:</b> copy dari Excel lalu paste di bawah. Format: Police No | Model | Customer | Alamat | No Rangka | No Telp.</p>
    <textarea value={bulk} onChange={(e)=>setBulk(e.target.value)} placeholder={'Contoh dari Excel:\nDK-1848-FBT\tRUSH\tWEDA GAMA\tPERUM DALUNG...\tMHK...\t62812...'} style={styles.bulkBox}/>
    <button style={styles.green} onClick={importBulk}>Import Customer Banyak</button>
    <button style={styles.btn} onClick={exportJson}>Export Backup</button>
    <button style={styles.btn} onClick={()=>setCustomerDb([...customerDb,{polisi:"",kendaraan:"",customer:"",alamat:"",rangka:"",phone:""}])}>+ Add Customer</button>
    <table style={styles.table}><thead><tr><th>Police No</th><th>Model</th><th>Customer</th><th>Alamat</th><th>No Rangka</th><th>No Telp</th><th>Act</th></tr></thead><tbody>{customerDb.map((c,i)=><tr key={i}>{["polisi","kendaraan","customer","alamat","rangka","phone"].map(k=><td key={k}><input value={c[k]||""} onChange={e=>setCustomerDb(customerDb.map((x,j)=>j===i?{...x,[k]:e.target.value}:x))} style={styles.cellInput}/></td>)}<td><button style={styles.del} onClick={()=>setCustomerDb(customerDb.filter((_,j)=>j!==i))}>Hapus</button></td></tr>)}</tbody></table></section>
}
function PDFView({refx,form,totals}){return <div ref={refx} style={styles.pdf}><h1>FORM ESTIMASI BIAYA</h1><div style={styles.pdfGrid}><div><h3>DATA PELANGGAN</h3><p>Nama: {form.customer}</p><p>Contact: {form.contact}</p><p>Telepon: {form.phone}</p><p>Alamat: {form.alamat}</p></div><div><h3>DATA KENDARAAN</h3><p>No Polisi: {form.polisi}</p><p>Type: {form.kendaraan}</p><p>No Rangka: {form.rangka}</p><p>Tahun: {form.tahun}</p></div></div><h2>BERBAYAR / CHARGEABLE - PARTS</h2><PdfTable rows={form.parts} cols={["partNo","partName","qty","price","total"]}/><h2>SUBLET / ADDITIONAL JOB</h2><PdfTable rows={form.sublets} cols={["subletNo","subletName","qty","price","total"]}/><h2>JASA PEKERJAAN</h2><PdfTable rows={form.jasa} cols={["jasaName","rate","price","total"]}/><div style={{textAlign:"right"}}><p>Total Parts Include PPN: Rp {rupiah(totals.totalParts)}</p><p>DPP Parts: Rp {rupiah(totals.dppParts)}</p><p>Diskon Parts: Rp {rupiah(totals.discParts)}</p><p>Total Parts Setelah Diskon + PPN: Rp {rupiah(totals.totalPartsAfterDisc)}</p><p>Total Sublet: Rp {rupiah(totals.totalSublet)}</p><p>Total Jasa Include PPN: Rp {rupiah(totals.totalJasa)}</p><p>DPP Jasa: Rp {rupiah(totals.dppJasa)}</p><p>Diskon Jasa: Rp {rupiah(totals.discJasa)}</p><p>Total Jasa Setelah Diskon + PPN: Rp {rupiah(totals.totalJasaAfterDisc)}</p><h2>Grand Total: Rp {rupiah(totals.grandTotal)}</h2></div><div style={styles.sign}><b>Disiapkan</b><b>Kepala Bengkel<br/>{form.kepalaBengkel}</b><b>Pelanggan</b></div></div>}
function PdfTable({rows,cols}){return <table style={styles.pdfTable}><thead><tr><th>No</th>{cols.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{rows.length?rows.map((r,i)=><tr key={r.id||i}><td>{i+1}</td>{cols.map(c=><td key={c}>{["price","total"].includes(c)?"Rp "+rupiah(r[c]):r[c]}</td>)}</tr>):<tr><td colSpan={cols.length+1}>-</td></tr>}</tbody></table>}
const styles={app:{display:"flex",minHeight:"100vh",background:"#f0f0f0",fontFamily:"Arial"},sidebar:{width:260,padding:14,background:"white",borderRight:"1px solid #ccc"},logo:{color:"red",border:"1px solid #408cff",borderRadius:8,fontSize:30,fontWeight:"bold",width:55,padding:8},nav:{padding:12,borderBottom:"1px solid #eee"},navActive:{padding:12,background:"#eef1f5",fontWeight:"bold"},menu:{display:"block",width:"100%",padding:12,background:"white",border:"none",textAlign:"left",cursor:"pointer"},menuOn:{display:"block",width:"100%",padding:12,background:"#0b449d",color:"white",borderRadius:6,textAlign:"left"},main:{flex:1,padding:20},card:{background:"white",border:"1px solid #aaa",borderRadius:8,padding:18,marginBottom:18},tabs:{display:"grid",gridTemplateColumns:"1fr 1fr",textAlign:"center",background:"#ddd",borderRadius:6,overflow:"hidden",marginBottom:15},grid4:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16},grid3:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16},grid2:{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:16},label:{fontSize:13,fontWeight:"bold"},input:{width:"100%",padding:10,border:"1px solid #bbb",borderRadius:5,marginTop:6,boxSizing:"border-box"},cellInput:{width:"100%",padding:8,border:"1px solid #bbb",borderRadius:5,boxSizing:"border-box"},smallInput:{width:70,padding:8,textAlign:"center",border:"1px solid #bbb",borderRadius:5},table:{width:"100%",borderCollapse:"collapse",marginTop:8},btn:{padding:"9px 14px",border:"1px solid #999",borderRadius:5,background:"white",cursor:"pointer",margin:5},green:{padding:"10px 16px",border:"none",borderRadius:5,background:"#16a34a",color:"white",cursor:"pointer",margin:5},greenRight:{float:"right",padding:"12px 20px",border:"none",borderRadius:6,background:"#16a34a",color:"white",fontWeight:"bold"},blue:{padding:"10px 16px",border:"none",borderRadius:5,background:"#0b45c5",color:"white",cursor:"pointer",margin:5},red:{padding:"10px 16px",border:"none",borderRadius:5,background:"#ef4444",color:"white",cursor:"pointer",margin:5},del:{padding:"7px 10px",border:"none",background:"transparent",color:"red",cursor:"pointer"},discount:{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,alignItems:"end",marginTop:20},actions:{display:"flex",justifyContent:"flex-end",gap:8,marginTop:15},pdf:{width:900,background:"white",padding:40,margin:"30px auto",textAlign:"center"},pdfGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:30,textAlign:"left"},pdfTable:{width:"100%",borderCollapse:"collapse",margin:"10px 0 25px"},sign:{display:"flex",justifyContent:"space-between",marginTop:60},flatRateBox:{display:"grid",gridTemplateColumns:"100px 80px 1fr 80px 140px",gap:10,alignItems:"center",background:"#fffbe6",border:"1px solid #d6c67a",borderRadius:7,padding:10,marginBottom:12},select:{width:"100%",padding:9,border:"1px solid #bbb",borderRadius:5,background:"white"},flatRateInput:{padding:9,border:"1px solid #bbb",borderRadius:5,background:"#eee",textAlign:"right",fontWeight:"bold"},totalBox:{gridColumn:"span 1",textAlign:"right",lineHeight:1.2},bulkBox:{width:"100%",minHeight:110,padding:10,border:"1px solid #aaa",borderRadius:6,boxSizing:"border-box",fontFamily:"Consolas, monospace",marginBottom:10}};
