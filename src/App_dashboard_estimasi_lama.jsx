import {
  useState,
  useRef,
} from "react";

import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import Tesseract from "tesseract.js";

export default function App() {
  const pdfRef = useRef();

  const [customer, setCustomer] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [alamat, setAlamat] = useState("");
  const [polisi, setPolisi] = useState("");
  const [kendaraan, setKendaraan] = useState("");
  const [rangka, setRangka] = useState("");
  const [tahun, setTahun] = useState("");
  const [tglEstimasi, setTglEstimasi] = useState("");
  const [discPart, setDiscPart] = useState(0);
  const [discJasa, setDiscJasa] = useState(0);
  const [discPartManual, setDiscPartManual] = useState(0);
  const [discJasaManual, setDiscJasaManual] = useState(0);

  const [parts, setParts] = useState([]);
  const [jasa, setJasa] = useState([]);
  const handleFlatRateChange = (e) => {
  const type = e.target.value;

  setFlatRateType(type);

  const harga =
    flatRateList[type] || 0;

  setJasaName(type);
  setRate(1);
  setJasaPrice(harga);
};

  const [partNo, setPartNo] = useState("");
  const [partName, setPartName] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");

  const [jasaName, setJasaName] = useState("LCGC");
  const [rate, setRate] = useState("1");
  const [jasaPrice, setJasaPrice] = useState("180930");
  const [flatRateType, setFlatRateType] =
  useState("LCGC");

const flatRateList = {
  "NEW ENTRY": 180930,
  "ECO": 256410,
  "PAS": 329670,
  "MEXL": 567210,
  "HEXL": 643800,
  "CBU": 643800,
  "LEXUS": 705960,
  "LCGC": 180930,
  "COM": 223110,
};

 const rupiah = (angka) => {
  const number = Math.round(Number(angka) || 0);
  return new Intl.NumberFormat("id-ID").format(number);
};

 const parsePrice = (value) => {
  if (!value) return 0;

  let text = String(value).trim();

  // hilangkan .00 di belakang
  text = text.replace(/\.00$/, "");

  // contoh 430,000 jadi 430000
  text = text.replace(/,/g, "");

  // contoh 430.000 jadi 430000
  text = text.replace(/\./g, "");

  return Number(text) || 0;
};
  const tambahPart = () => {
    const qtyNumber = Number(qty) || 0;
    const priceNumber = Number(price) || 0;
    const total = qtyNumber * priceNumber;

    const data = {
      partNo,
      partName,
      qty: qtyNumber,
      price: priceNumber,
      total,
    };

    setParts([...parts, data]);

    setPartNo("");
    setPartName("");
    setQty("");
    setPrice("");
  };

  const tambahJasa = () => {
    const rateNumber = Number(rate) || 0;
    const priceNumber = Number(jasaPrice) || 0;
    const total = rateNumber * priceNumber;

    const data = {
      jasaName,
      rate: rateNumber,
      jasaPrice: priceNumber,
      total,
    };

    setJasa([...jasa, data]);

    setJasaName("");
    setRate("");
    setJasaPrice("");
  };

  const totalParts = parts.reduce(
    (a, b) => a + (Number(b.total) || 0),
    0
  );

  const totalJasa = jasa.reduce(
    (a, b) => a + (Number(b.total) || 0),
    0
  );

  const dppParts = totalParts / 1.11;
  const dppJasa = totalJasa / 1.11;

  // Diskon spare part langsung input Rupiah manual
  const discPartAmount =
    Number(discPartManual) || 0;

  // Diskon jasa tetap pakai persen, bisa diubah manual di kolom Diskon Jasa (%)
  const discJasaAmount =
    dppJasa * ((Number(discJasa) || 0) / 100);

  const totalPartsAfterDisc =
    dppParts - discPartAmount;

  const totalJasaAfterDisc =
    dppJasa - discJasaAmount;

  const grandTotal =
    totalPartsAfterDisc + totalJasaAfterDisc;

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const result = await Tesseract.recognize(file, "eng", {
      tessedit_pageseg_mode: "6",
    });

    const text = result.data.text;

    const rawLines = text
      .split("\n")
      .map((x) => x.trim().replace(/\s+/g, " "))
      .filter((x) => x.length > 0);

    const newParts = [];

    const isHeaderLine = (line) => {
      const upper = line.toUpperCase();

      return (
        upper.includes("PART NO") ||
        upper.includes("PART NAME") ||
        upper.includes("RETAIL PRICE") ||
        upper.includes("SUBSTITUTION") ||
        upper.includes("SUBTITUTION") ||
        upper.includes("STOCK") ||
        upper.includes("MODEL CODE") ||
        upper.includes("ORDER LOT") ||
        upper.includes("IMPORT") ||
        upper.includes("LOCAL") ||
        upper.includes("PROD LT")
      );
    };

    const priceRegex =
      /\b\d{1,3}(?:[,.]\d{3})+(?:[,.]\d{2})?\b|\b\d{5,9}\b/;

    rawLines.forEach((line) => {
      if (isHeaderLine(line)) return;

      const partNoMatch =
        line.match(/\b[0-9A-Z]{8,12}\b/);

      const priceMatches =
        line.match(new RegExp(priceRegex, "g")) || [];

      if (!partNoMatch || priceMatches.length === 0) {
        return;
      }

      const partNoData = partNoMatch[0];

      const priceText =
        priceMatches[priceMatches.length - 1];

      let priceData = parsePrice(priceText);

      // Koreksi OCR: angka seperti 50,000.00 kadang terbaca jadi 5.000.000
      if (priceData >= 1000000) {
        priceData = Math.round(priceData / 100);
      }

      let partNameData = line
        .replace(partNoData, "")
        .replace(priceText, "")
        .replace(/\bAvailable\b/gi, "")
        .replace(/\bNot\s*Available\b/gi, "")
        .replace(/\bNotAvailable\b/gi, "")
        .replace(/\bF[0-9A-Z]{2,}\b/gi, "")
        .replace(/\bB[0-9A-Z]{2,}\b/gi, "")
        .replace(/\b[0-9A-Z]{8,12}\b/g, "")
        .replace(/\b\d{1,4}\b/g, "")
        .replace(/\bL\b/g, "")
        .replace(/\bN\b/g, "")
        .replace(/\s+/g, " ")
        .trim();

      if (!partNameData) {
        partNameData = "-";
      }

      newParts.push({
        partNo: partNoData,
        partName: partNameData,
        qty: 1,
        price: priceData,
        total: priceData,
      });
    });

    setParts((prev) => [
      ...prev,
      ...newParts,
    ]);

    alert(
      `${newParts.length} Part berhasil ditambahkan`
    );
  };

  const handleSOImageUpload = async (e) => {
    const file = e.target.files[0];

    if (!file) return;

    const result = await Tesseract.recognize(
      file,
      "eng"
    );

    const text = result.data.text;
    const normalizedText = text
      .replace(/\r/g, "\n")
      .replace(/[ \t]+/g, " ");

    const cleanValue = (value) => {
      return (value || "")
        .replace(/\s+/g, " ")
        .replace(/\s*:\s*$/, "")
        .replace(/^[:\s]+/, "")
        .trim();
    };

    const getLineValue = (label) => {
      const regex = new RegExp(
        label + "\\s*:?\\s*([^\\n\\r]*)",
        "i"
      );

      const match = normalizedText.match(regex);

      return match ? cleanValue(match[1]) : "";
    };

    const getBlockValue = (
      label,
      stopLabels = []
    ) => {
      const lines = normalizedText
        .split("\n")
        .map((x) => cleanValue(x))
        .filter(Boolean);

      const labelRegex = new RegExp(label, "i");
      const stopRegex = new RegExp(
        stopLabels.join("|"),
        "i"
      );

      let found = false;
      const collected = [];

      for (const line of lines) {
        if (!found && labelRegex.test(line)) {
          found = true;
          const value = cleanValue(
            line.replace(labelRegex, "")
          );
          if (value) collected.push(value);
          continue;
        }

        if (found) {
          if (stopLabels.length && stopRegex.test(line)) {
            break;
          }

          collected.push(line);
        }
      }

      return cleanValue(collected.join(" "));
    };

    const nama =
      getBlockValue("Nama", [
        "Alamat",
        "No\\.?\\s*Telepon",
        "C\\.?\\s*Person",
        "No\\s*Polisi",
      ]) || getLineValue("Nama");

    const alamatSO =
      getBlockValue("Alamat", [
        "No\\.?\\s*Telepon",
        "C\\.?\\s*Person",
        "No\\s*Polisi",
        "Masuk\\s*Tgl",
        "Masuk\\s*Jam",
      ]) || getLineValue("Alamat");

    const noTelp =
      getBlockValue("No\\.?\\s*Telepon", [
        "C\\.?\\s*Person",
        "No\\s*Polisi",
        "Alamat",
      ]) || getLineValue("No\\.?\\s*Telepon");

    const cPerson =
      getBlockValue("C\\.?\\s*Person", [
        "No\\s*Polisi",
        "Alamat",
        "Masuk\\s*Tgl",
      ]) || getLineValue("C\\.?\\s*Person");

    const model =
      getLineValue("Model") ||
      getLineValue("Type\\s*Kendaraan");

    const noPolMatch =
      normalizedText.match(/No\s*Polisi\s*:?\s*([A-Z0-9\-]+)/i) ||
      normalizedText.match(/\bDK[-\s]?[0-9A-Z]+[-\s]?[A-Z]+\b/i);

    const rangkaMatch =
      normalizedText.match(/FRM\s*:?\s*([A-Z0-9]+)/i) ||
      normalizedText.match(/No\s*Rangka\s*:?\s*([A-Z0-9]+)/i) ||
      normalizedText.match(/\b(MH[A-Z0-9]{10,})\b/i);

    const tahunMatch =
      normalizedText.match(/D\/D\s*:?\s*([0-9]{4})/i) ||
      normalizedText.match(/Tahun\s*:?\s*([0-9]{4})/i) ||
      normalizedText.match(/\b(20[0-9]{2})\b/);

    const estimasiMatch =
      normalizedText.match(/Janji\s*Penyerahan\s*:?\s*([0-9]{4}[-\/][0-9]{1,2}[-\/][0-9]{1,2}(?:\/[0-9]{1,2}:[0-9]{2})?)/i) ||
      normalizedText.match(/Janji\s*Penyerahan\s*:?\s*([0-9]{1,2}[-\/][0-9]{1,2}[-\/][0-9]{4}(?:\s+[0-9]{1,2}:[0-9]{2})?)/i) ||
      normalizedText.match(/([0-9]{1,2}\s*(?:Mei|Jan|Feb|Mar|Apr|Jun|Jul|Agu|Sep|Okt|Nov|Des)\s*20[0-9]{2})/i);

    setCustomer(nama);
    setAlamat(alamatSO);
    setPhone(noTelp);
    setContact(cPerson);
    setPolisi(noPolMatch ? cleanValue(noPolMatch[1] || noPolMatch[0]) : "");
    setKendaraan(model);
    setRangka(rangkaMatch ? cleanValue(rangkaMatch[1]) : "");
    setTahun(tahunMatch ? cleanValue(tahunMatch[1]) : "");
    setTglEstimasi(
      estimasiMatch ? cleanValue(estimasiMatch[1]) : ""
    );

    alert("Data Service Order berhasil dibaca");
  };

  const downloadPDF = async () => {
    const inputPdf = pdfRef.current;

   const canvas =
  await html2canvas(inputPdf, {
    scale: 4,
    useCORS: true,
    scrollY: 0,
    windowWidth: inputPdf.scrollWidth,
    windowHeight: inputPdf.scrollHeight,
  });

    const imgData =
      canvas.toDataURL("image/png");

    const pdf = new jsPDF(
      "p",
      "mm",
      "a4"
    );

    const imgWidth = 200;

    const pageHeight = 295;

    const imgHeight =
      (canvas.height * imgWidth) /
      canvas.width;

    let heightLeft = imgHeight;

    let position = 0;

    pdf.addImage(
  imgData,
  "PNG",
  5,
  position + 5,
  imgWidth - 10,
  imgHeight
);

    heightLeft -= pageHeight;

    while (heightLeft >= 0) {
      position =
        heightLeft - imgHeight;

      pdf.addPage();

      pdf.addImage(
        imgData,
        "PNG",
        0,
        position,
        imgWidth,
        imgHeight
      );

      heightLeft -= pageHeight;
    }

    pdf.save("estimasi.pdf");
  };


  const [activeTab, setActiveTab] = useState("profile");

  const updatePart = (index, field, value) => {
    const updated = [...parts];
    const numberFields = ["qty", "price"];
    updated[index][field] = numberFields.includes(field) ? Number(value) || 0 : value;
    updated[index].total = (Number(updated[index].qty) || 0) * (Number(updated[index].price) || 0);
    setParts(updated);
  };

  const removePart = (index) => {
    setParts(parts.filter((_, i) => i !== index));
  };

  const updateJasa = (index, field, value) => {
    const updated = [...jasa];
    const numberFields = ["rate", "jasaPrice"];
    updated[index][field] = numberFields.includes(field) ? Number(value) || 0 : value;
    updated[index].total = (Number(updated[index].rate) || 0) * (Number(updated[index].jasaPrice) || 0);
    setJasa(updated);
  };

  const removeJasa = (index) => {
    setJasa(jasa.filter((_, i) => i !== index));
  };

  return (
    <div style={page}>
      <div style={appCard}>
        <h2 style={title}>FORM ESTIMASI</h2>

        <div style={tabs}>
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            style={activeTab === "profile" ? tabActive : tab}
          >
            Profile
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("estimasi")}
            style={activeTab === "estimasi" ? tabActive : tab}
          >
            Estimasi Biaya
          </button>
        </div>

        {activeTab === "profile" && (
          <div style={panel}>
            <section style={sectionBox}>
              <div style={sectionTitle}>🚙 Informasi Kendaraan</div>

              <div style={grid4}>
                <Field label="No Polisi *">
                  <div style={{ display: "flex" }}>
                    <input placeholder="DK-XXX-XX" value={polisi} onChange={(e) => setPolisi(e.target.value)} style={{ ...smallInput, borderRadius: "4px 0 0 4px" }} />
                    <button type="button" style={searchBtn}>⌕</button>
                  </div>
                </Field>

                <Field label="Type Kendaraan *">
                  <input placeholder="PILIH TYPE KENDARAAN" value={kendaraan} onChange={(e) => setKendaraan(e.target.value)} style={smallInput} />
                </Field>

                <Field label="No Rangka *">
                  <input placeholder="MHFXXXXXX" value={rangka} onChange={(e) => setRangka(e.target.value)} style={smallInput} />
                </Field>

                <Field label="Tahun *">
                  <input placeholder="2XXX" value={tahun} onChange={(e) => setTahun(e.target.value)} style={smallInput} />
                </Field>
              </div>

              <div style={{ textAlign: "right", marginTop: "8px" }}>
                <label style={btnSO}>
                  ⌕ Pencarian dgn No SO
                  <input type="file" accept="image/*" onChange={handleSOImageUpload} style={{ display: "none" }} />
                </label>
              </div>
            </section>

            <section style={sectionBox}>
              <div style={sectionTitle}>👤 Informasi Pelanggan</div>
              <div style={grid2}>
                <Field label="Nama Pelanggan *">
                  <input placeholder="Nama Pelanggan" value={customer} onChange={(e) => setCustomer(e.target.value)} style={smallInput} />
                </Field>
                <Field label="No Telepon">
                  <input placeholder="628123456789" value={phone} onChange={(e) => setPhone(e.target.value)} style={smallInput} />
                </Field>
                <Field label="Contact Person">
                  <input placeholder="Nama Contact Person" value={contact} onChange={(e) => setContact(e.target.value)} style={smallInput} />
                </Field>
                <Field label="Alamat">
                  <input placeholder="Alamat Lengkap" value={alamat} onChange={(e) => setAlamat(e.target.value)} style={smallInput} />
                </Field>
              </div>
            </section>

            <section style={sectionBox}>
              <div style={sectionTitle}>▣ Informasi Pembuat Estimasi</div>
              <div style={grid3}>
                <Field label="Nama Staff *">
                  <select style={smallInput}>
                    <option>Pilih Staff</option>
                    <option>KOMANG AYU WARDANI</option>
                  </select>
                </Field>
                <Field label="Jabatan">
                  <input placeholder="Jabatan" style={smallInput} />
                </Field>
                <Field label="Kepala Bengkel">
                  <input value="Dewa Nym Antara" readOnly style={smallInput} />
                </Field>
              </div>
            </section>
          </div>
        )}

        {activeTab === "estimasi" && (
          <div style={panel}>
            <section style={filterBox}>
              <b>Filter Paket Pekerjaan</b>
              <Field label="Repair Type">
                <select value={flatRateType} onChange={handleFlatRateChange} style={smallInput}>
                  {Object.keys(flatRateList).map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                </select>
              </Field>
            </section>

            <section>
              <div style={sectionTitle}>🔧 Estimasi Parts</div>

              <table style={dashTable}>
                <thead>
                  <tr>
                    <th>FREE</th>
                    <th>PART NO</th>
                    <th>PART NAME</th>
                    <th>QTY</th>
                    <th>PRICE</th>
                    <th>TOTAL</th>
                    <th>ACT</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((item, index) => (
                    <tr key={index}>
                      <td><input type="checkbox" /></td>
                      <td><input value={item.partNo} onChange={(e) => updatePart(index, "partNo", e.target.value)} style={cellInput} /></td>
                      <td><input value={item.partName} onChange={(e) => updatePart(index, "partName", e.target.value)} style={cellInput} /></td>
                      <td><input type="number" value={item.qty} onChange={(e) => updatePart(index, "qty", e.target.value)} style={{ ...cellInput, textAlign: "center" }} /></td>
                      <td><input type="number" value={item.price} onChange={(e) => updatePart(index, "price", e.target.value)} style={{ ...cellInput, textAlign: "right" }} /></td>
                      <td><input readOnly value={rupiah(item.total)} style={{ ...cellInput, textAlign: "right", background: "#eee" }} /></td>
                      <td><button type="button" onClick={() => removePart(index)} style={trashBtn}>🗑</button></td>
                    </tr>
                  ))}

                  <tr>
                    <td></td>
                    <td><input placeholder="Part No" value={partNo} onChange={(e) => setPartNo(e.target.value)} style={cellInput} /></td>
                    <td><input placeholder="Part Name" value={partName} onChange={(e) => setPartName(e.target.value)} style={cellInput} /></td>
                    <td><input placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} style={{ ...cellInput, textAlign: "center" }} /></td>
                    <td><input placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} style={{ ...cellInput, textAlign: "right" }} /></td>
                    <td></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>

              <div style={buttonRow}>
                <button type="button" onClick={tambahPart} style={smallBtn}>⊕ Add Part</button>
                <label style={greenSmallBtn}>
                  ⊞ Add from Image
                  <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
                </label>
              </div>
            </section>

            <hr />

            <section>
              <div style={sectionTitle}>🛠 Jasa Pekerjaan</div>
              <div style={yellowBox}>
                <b>Flat Rate</b>
                <select value={flatRateType} onChange={handleFlatRateChange} style={{ ...smallInput, width: "260px" }}>
                  {Object.keys(flatRateList).map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                </select>
                <input value={jasaPrice} onChange={(e) => setJasaPrice(e.target.value)} style={{ ...smallInput, width: "120px" }} />
              </div>

              <table style={dashTable}>
                <thead>
                  <tr>
                    <th>FREE</th>
                    <th>PEKERJAAN</th>
                    <th>RATE</th>
                    <th>PRICE</th>
                    <th>TOTAL</th>
                    <th>ACT</th>
                  </tr>
                </thead>
                <tbody>
                  {jasa.map((item, index) => (
                    <tr key={index}>
                      <td><input type="checkbox" /></td>
                      <td><input value={item.jasaName} onChange={(e) => updateJasa(index, "jasaName", e.target.value)} style={cellInput} /></td>
                      <td><input type="number" value={item.rate} onChange={(e) => updateJasa(index, "rate", e.target.value)} style={{ ...cellInput, textAlign: "center" }} /></td>
                      <td><input type="number" value={item.jasaPrice} onChange={(e) => updateJasa(index, "jasaPrice", e.target.value)} style={{ ...cellInput, textAlign: "right" }} /></td>
                      <td><input readOnly value={rupiah(item.total)} style={{ ...cellInput, textAlign: "right", background: "#eee" }} /></td>
                      <td><button type="button" onClick={() => removeJasa(index)} style={trashBtn}>🗑</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <button type="button" onClick={tambahJasa} style={smallBtn}>⊕ Add Jasa</button>
            </section>

            <div style={totalPanel}>
              <div>Total Parts <b>Rp {rupiah(totalParts)}</b></div>
              <div>Total Sublet <b>Rp 0</b></div>
              <div>Total Jasa <b>Rp {rupiah(totalJasa)}</b></div>
              <div style={grandLine}>Grand Total <b>Rp {rupiah(grandTotal)}</b></div>
            </div>
          </div>
        )}

        <div style={footerBar}>
          <button type="button" style={resetBtn}>↻ Reset</button>
          <div>
            <button type="button" onClick={() => alert("Tampilan gambar bisa dibuat setelah ini")} style={btnGreen}>Submit & Create Image</button>
            <button type="button" onClick={downloadPDF} style={btnPDF}>Submit & Create PDF</button>
          </div>
        </div>
      </div>

      <div ref={pdfRef} style={pdfWrap}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div>
            <h2>PT. AGUNG AUTOMALL GIANYAR</h2>
            <p>JL. BY PASS BURUAN BLAHBATUH GIANYAR</p>
            <p>TELP: 03614255474</p>
          </div>
          <h1 style={{ color: "#d71920" }}>TOYOTA</h1>
        </div>

        <h1 style={{ textAlign: "center", marginTop: "20px", fontSize: "42px", fontWeight: "bold" }}>
          ESTIMASI BIAYA
        </h1>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px", marginTop: "25px", fontSize: "15px", lineHeight: "24px", textAlign: "left" }}>
          <table style={headerTable}><tbody>
            <tr><td style={labelTd}>Nama Pelanggan</td><td style={colonTd}>:</td><td style={valueTd}>{customer}</td></tr>
            <tr><td style={labelTd}>Contact Person</td><td style={colonTd}>:</td><td style={valueTd}>{contact}</td></tr>
            <tr><td style={labelTd}>No. Telepon</td><td style={colonTd}>:</td><td style={valueTd}>{phone}</td></tr>
            <tr><td style={labelTd}>Alamat</td><td style={colonTd}>:</td><td style={valueTd}>{alamat}</td></tr>
          </tbody></table>

          <table style={headerTable}><tbody>
            <tr><td style={labelTd}>No. Polisi</td><td style={colonTd}>:</td><td style={valueTd}>{polisi}</td></tr>
            <tr><td style={labelTd}>Type Kendaraan</td><td style={colonTd}>:</td><td style={valueTd}>{kendaraan}</td></tr>
            <tr><td style={labelTd}>No. Rangka / Thn</td><td style={colonTd}>:</td><td style={valueTd}>{rangka}{tahun ? ` / ${tahun}` : ""}</td></tr>
            <tr><td style={labelTd}>Tanggal Estimasi</td><td style={colonTd}>:</td><td style={valueTd}>{tglEstimasi}</td></tr>
          </tbody></table>
        </div>

        <h3 style={{ textAlign: "center", marginTop: "30px" }}>BERBAYAR / CHARGEABLE</h3>

        <table width="100%" border="1" cellPadding="10" style={{ borderCollapse: "collapse", fontSize: "12px" }}>
          <thead style={{ background: "#dfe8e8" }}>
            <tr><th>No</th><th>Part No</th><th>Part Name</th><th>Qty</th><th>Price</th><th>Total</th></tr>
          </thead>
          <tbody>
            {parts.map((item, index) => (
              <tr key={index}>
                <td style={pdfCell}>{index + 1}</td>
                <td style={pdfCell}>{item.partNo}</td>
                <td style={pdfCell}>{item.partName}</td>
                <td style={{ ...pdfCell, textAlign: "center", fontSize: "16px", fontWeight: "bold" }}>{item.qty}</td>
                <td style={pdfCell}>Rp {rupiah(item.price)}</td>
                <td style={pdfCell}>Rp {rupiah(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table width="100%" border="1" cellPadding="8" style={{ borderCollapse: "collapse", fontSize: "12px", marginTop: "20px" }}>
          <thead style={{ background: "#ece8d9" }}>
            <tr><th>No</th><th>Jasa</th><th>Rate</th><th>Price</th><th>Total</th></tr>
          </thead>
          <tbody>
            {jasa.map((item, index) => (
              <tr key={index}>
                <td style={pdfCell}>{index + 1}</td>
                <td style={pdfCell}>{item.jasaName}</td>
                <td style={pdfCell}>{item.rate}</td>
                <td style={pdfCell}>Rp {rupiah(item.jasaPrice)}</td>
                <td style={pdfCell}>Rp {rupiah(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: "15px", marginLeft: "auto", width: "360px", textAlign: "right", fontSize: "11px", lineHeight: "18px" }}>
          <p><b>Total Parts Sebelum PPN :</b> Rp {rupiah(dppParts)}</p>
          <p><b>Diskon Spare Part :</b> Rp {rupiah(discPartAmount)}</p>
          <p><b>Total Parts Setelah Diskon :</b> Rp {rupiah(totalPartsAfterDisc)}</p>
          <p><b>Total Jasa Sebelum PPN :</b> Rp {rupiah(dppJasa)}</p>
          <p><b>Diskon Jasa ({discJasa || 0}%) :</b> Rp {rupiah(discJasaAmount)}</p>
          <p><b>Total Jasa Setelah Diskon :</b> Rp {rupiah(totalJasaAfterDisc)}</p>
          <div style={{ marginTop: "8px", borderTop: "1px solid #000", paddingTop: "6px", fontSize: "20px", fontWeight: "bold" }}>
            Grand Total : Rp {rupiah(grandTotal)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", fontSize: "12px", fontWeight: 600 }}>
      <div style={{ marginBottom: "6px" }}>{label}</div>
      {children}
    </label>
  );
}


const page = {
  background: "#f5f6f8",
  minHeight: "100vh",
  padding: "10px",
  fontFamily: "Arial, sans-serif",
};

const appCard = {
  maxWidth: "980px",
  margin: "0 auto",
  background: "#fff",
  border: "1px solid #aaa",
  borderRadius: "6px",
};

const title = {
  textAlign: "center",
  margin: "12px 0",
  fontSize: "20px",
};

const tabs = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "0",
  margin: "0 14px 10px",
  background: "#ddd",
  borderRadius: "5px",
  overflow: "hidden",
};

const tab = {
  border: "none",
  padding: "10px",
  background: "#ddd",
  cursor: "pointer",
};

const tabActive = {
  ...tab,
  background: "#d8eaff",
  fontWeight: "bold",
};

const panel = {
  margin: "0 14px 10px",
  border: "1px solid #aaa",
  borderRadius: "6px",
  padding: "14px",
};

const sectionBox = {
  borderBottom: "1px solid #bbb",
  paddingBottom: "14px",
  marginBottom: "16px",
};

const sectionTitle = {
  fontWeight: "bold",
  fontSize: "16px",
  marginBottom: "14px",
};

const grid4 = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1.4fr .6fr",
  gap: "18px",
};

const grid3 = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: "28px",
};

const grid2 = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "18px 60px",
};

const smallInput = {
  width: "100%",
  height: "34px",
  border: "1px solid #b9b9b9",
  borderRadius: "4px",
  padding: "0 10px",
  boxSizing: "border-box",
  fontSize: "12px",
};

const searchBtn = {
  width: "38px",
  border: "1px solid #b9b9b9",
  borderLeft: "none",
  borderRadius: "0 4px 4px 0",
  background: "#eee",
};

const filterBox = {
  background: "#eef6ff",
  border: "1px solid #94a3b8",
  borderRadius: "5px",
  padding: "10px",
  marginBottom: "14px",
};

const dashTable = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: "0 6px",
  fontSize: "11px",
};

const cellInput = {
  width: "100%",
  height: "28px",
  border: "1px solid #aaa",
  borderRadius: "4px",
  padding: "0 8px",
  boxSizing: "border-box",
  fontSize: "12px",
};

const buttonRow = {
  display: "flex",
  justifyContent: "space-between",
  marginTop: "8px",
};

const smallBtn = {
  border: "1px solid #aaa",
  background: "#fff",
  padding: "8px 14px",
  borderRadius: "4px",
  cursor: "pointer",
};

const greenSmallBtn = {
  background: "#dcfce7",
  border: "1px solid #22c55e",
  color: "#15803d",
  padding: "8px 14px",
  borderRadius: "4px",
  cursor: "pointer",
};

const yellowBox = {
  display: "flex",
  gap: "12px",
  alignItems: "center",
  background: "#fffde7",
  border: "1px solid #d6d3a3",
  borderRadius: "5px",
  padding: "8px",
  marginBottom: "12px",
};

const totalPanel = {
  width: "360px",
  marginLeft: "auto",
  marginTop: "18px",
  display: "grid",
  gap: "8px",
  fontSize: "13px",
};

const grandLine = {
  borderTop: "1px solid #999",
  paddingTop: "10px",
  fontSize: "16px",
  color: "#5b8def",
};

const footerBar = {
  display: "flex",
  justifyContent: "space-between",
  padding: "10px 14px",
  borderTop: "1px solid #ddd",
};

const resetBtn = {
  background: "#ef4444",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  padding: "10px 18px",
};

const btnGreen = {
  background: "#16a34a",
  color: "white",
  border: "none",
  padding: "10px 16px",
  borderRadius: "4px",
  cursor: "pointer",
  marginRight: "8px",
};

const btnPDF = {
  background: "#1d4ed8",
  color: "white",
  border: "none",
  padding: "10px 16px",
  borderRadius: "4px",
  cursor: "pointer",
};

const btnSO = {
  display: "inline-block",
  background: "#dcfce7",
  color: "#111",
  border: "1px solid #86efac",
  padding: "9px 22px",
  borderRadius: "5px",
  cursor: "pointer",
  fontSize: "12px",
};

const trashBtn = {
  border: "none",
  background: "transparent",
  cursor: "pointer",
};

const pdfWrap = {
  width: "794px",
  margin: "30px auto",
  background: "white",
  padding: "40px",
  color: "black",
  fontFamily: "Arial, sans-serif",
};

const pdfCell = {
  height: "38px",
  lineHeight: "20px",
  verticalAlign: "middle",
  padding: "8px",
};

const headerTable = {
  width: "100%",
  borderCollapse: "collapse",
  textAlign: "left",
};

const labelTd = {
  width: "170px",
  fontWeight: "bold",
  verticalAlign: "top",
  paddingBottom: "6px",
};

const colonTd = {
  width: "12px",
  verticalAlign: "top",
  paddingBottom: "6px",
};

const valueTd = {
  verticalAlign: "top",
  paddingBottom: "6px",
  wordBreak: "break-word",
  textAlign: "left",
};
