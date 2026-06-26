import React, { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import { RefreshCw, Database, Users, UserCheck, UserX, UserPlus, Search, Download, Clock, Trash2, Upload } from 'lucide-react'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null
const TYPE_ALLOWED = ['OIL', 'SBE']

function norm(v){ return String(v ?? '').trim() }
function upper(v){ return norm(v).toUpperCase() }
function excelDateToJS(v){
  if (!v) return null
  if (v instanceof Date) return v.toISOString().slice(0,10)
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    if (!d) return null
    return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
  }
  const d = new Date(v)
  if (!isNaN(d)) return d.toISOString().slice(0,10)
  return null
}
function toNumber(v){
  if (typeof v === 'number') return v
  const s = norm(v).replace(/[^0-9,-]/g,'').replace(',', '.')
  return Number(s) || 0
}
function keyClean(v){ return upper(v).replace(/[^A-Z0-9]/g,'') }
function getValue(row, keys){
  const all = Object.keys(row || {})
  for (const k of keys){
    const kk = keyClean(k)
    const found = all.find(x => keyClean(x).includes(kk))
    if (found) return row[found]
  }
  return ''
}
function addMonths(date, months){ const d = new Date(date); d.setMonth(d.getMonth()+months); return d }
function dateStr(d){ return new Date(d).toISOString().slice(0,10) }
function daysBetween(a,b){ return Math.floor((new Date(b)-new Date(a))/(1000*60*60*24)) }
function monthsEarly(expected, actual){ const diff = daysBetween(actual, expected); return diff > 0 ? Math.max(1, Math.round(diff / 30)) : 0 }

function extractKmNumber(v){
  const n = parseInt(String(v ?? '').replace(/[^0-9]/g,''), 10)
  return Number.isFinite(n) ? n : null
}
function formatKmLabel(n){
  return n ? `${n.toLocaleString('id-ID')} KM` : ''
}
function getJobSbe(base){
  // Ambil dari kolom Excel "Job SBE" (contoh kolom P), bukan dari kilometer kendaraan.
  return norm(base?.job_sbe || getValue(base?.raw_data || {}, ['JOB SBE','JOBSBE','JOB SBE KM','SBE']))
}
function buildNextServiceInfo(base){
  const type = upper(base.repair_type)
  if(type === 'SBE'){
    const jobSbe = getJobSbe(base)
    const jobSbeNumber = extractKmNumber(jobSbe)
    return {
      last_sbe_km: jobSbe,
      next_service: jobSbeNumber ? `SBE ${formatKmLabel(jobSbeNumber + 10000)}` : 'SBE'
    }
  }
  return { last_sbe_km: '', next_service: 'OIL' }
}

function cleanPhoneKey(v){
  let digits = String(v ?? '').replace(/[^0-9]/g,'')
  if(digits.startsWith('0')) digits = '62' + digits.slice(1)
  return digits
}
function getWaCp(row){
  return norm(row?.wa_cp || getValue(row?.raw_data || {}, ['WA CP','WACP','WA','NO HP','NOHP','HP','PHONE','TELP','TELEPON','HANDPHONE']))
}
function mergePhones(...values){
  const out = []
  const seen = new Set()
  values.forEach(v => {
    const text = norm(v)
    if(!text) return
    const parts = text.split(/\n|;|,/).map(x=>norm(x)).filter(Boolean)
    parts.forEach(part => {
      const key = cleanPhoneKey(part)
      if(!key || key.length < 8) return
      if(seen.has(key)) return
      seen.add(key)
      out.push(part)
    })
  })
  return out.join(' / ')
}
function buildPhoneIndex(rows){
  const m = new Map()
  rows.forEach(r => {
    const key = vehicleKey(r)
    if(!key) return
    const wa = getWaCp(r)
    if(!wa) return
    m.set(key, mergePhones(m.get(key), wa))
  })
  return m
}
function firstPhoneForWa(v){
  const first = norm(v).split('/')[0] || ''
  const digits = cleanPhoneKey(first)
  return digits || ''
}

function parseAllSheets(file, onDone, onError){
  const reader = new FileReader()
  reader.onload = evt => {
    try{
      const wb = XLSX.read(evt.target.result)
      const json = wb.SheetNames.flatMap(sheetName => {
        const ws = wb.Sheets[sheetName]
        return XLSX.utils.sheet_to_json(ws, {defval:''}).map(row => ({...row, __sheet: sheetName}))
      })
      const payload = json.map(row => {
        const repairType = upper(getValue(row, ['REPAIRTYPE','RTYPE','TYPE','TYPESBE']))
        return {
          repair_date: excelDateToJS(getValue(row, ['REPAIRDATE','SERVICEDATE','DATE','TANGGAL'])),
          police_no: upper(getValue(row, ['POLICENO','NOPOL','PLAT','POLICE'])),
          chassis_no: upper(getValue(row, ['NORANGKA','NO RANGKA','CHASSIS','CHASSISNO','FRAMENO','VIN','NOKA'])),
          customer_name: norm(getValue(row, ['CUSTOMERNAME','CUSTOMER','NAMA'])),
          repair_type: repairType,
          sa: norm(getValue(row, ['SA','SERVICEADVISOR','ADVISOR'])),
          tts: norm(getValue(row, ['TTS','TECHNICIAN','TEKNISI','TECH'])),
          km: norm(getValue(row, ['KM','ODOMETER'])),
          omzet: toNumber(getValue(row, ['OMZET','AMOUNT','TOTAL','REVENUE','LABOR','PART'])),
          source_file: file.name,
          source_sheet: row.__sheet,
          raw_data: row
        }
      }).filter(r => r.repair_date && r.police_no && TYPE_ALLOWED.includes(r.repair_type))
      onDone(payload, wb.SheetNames.length)
    }catch(err){ onError(err) }
  }
  reader.onerror = () => onError(new Error('Gagal membaca file.'))
  reader.readAsArrayBuffer(file)
}
function vehicleKey(r){
  const plat = upper(r.police_no).replace(/[^A-Z0-9]/g,'')
  const rangka = upper(r.chassis_no).replace(/[^A-Z0-9]/g,'')
  return plat || (rangka ? `RANGKA:${rangka}` : '')
}
function latestByVehicle(rows){
  const m = new Map()
  rows.forEach(r => {
    const key = vehicleKey(r)
    if(!key) return
    if(!m.has(key) || new Date(m.get(key).repair_date) < new Date(r.repair_date)) m.set(key, r)
  })
  return m
}
function earliestByVehicle(rows){
  const m = new Map()
  rows.forEach(r => {
    const key = vehicleKey(r)
    if(!key) return
    if(!m.has(key) || new Date(m.get(key).repair_date) > new Date(r.repair_date)) m.set(key, r)
  })
  return m
}
function filterBase(rows, typeMode, saMode){
  return rows.filter(r => (typeMode === 'ALL' ? TYPE_ALLOWED : [typeMode]).includes(upper(r.repair_type)))
    .filter(r => saMode === 'ALL' || upper(r.sa) === upper(saMode))
    .filter(r => r.repair_date && (r.police_no || r.chassis_no))
}
function buildAnalytics(oldRows, currentRows, period, sampaiTanggal, typeMode, saMode){
  const now = sampaiTanggal ? new Date(sampaiTanggal) : new Date()
  const oldFiltered = filterBase(oldRows, typeMode, saMode).filter(r => new Date(r.repair_date) <= now)
  const currentFiltered = filterBase(currentRows, typeMode, saMode).filter(r => new Date(r.repair_date) <= now)
  const lastOldMap = latestByVehicle(oldFiltered)
  const firstCurrentMap = earliestByVehicle(currentFiltered)
  const oldVehicleAllSA = latestByVehicle(filterBase(oldRows, typeMode, 'ALL'))
  const oldPhoneMap = buildPhoneIndex(oldRows)
  const currentPhoneMap = buildPhoneIndex(currentRows)
  const phoneForKey = key => mergePhones(currentPhoneMap.get(key), oldPhoneMap.get(key))
  const pembanding=[], sudahDatang=[], datangAwal=[], belumDatang=[], due=[], lost=[]
  ;[...lastOldMap.values()].forEach(base => {
    const key = vehicleKey(base)
    const expected = addMonths(new Date(base.repair_date), period)
    const expectedTxt = dateStr(expected)
    const serviceInfo = buildNextServiceInfo(base)
    const wa_cp = phoneForKey(key)
    const hariSejak = daysBetween(base.repair_date, now)
    const telat = daysBetween(expected, now)
    const current = firstCurrentMap.get(key)
    const isDue = expected <= now
    if(isDue) pembanding.push({...base, ...serviceInfo, expected_date: expectedTxt, hari: hariSejak, telat_hari: Math.max(0,telat)})
    if(current){
      const early = monthsEarly(expected, current.repair_date)
      const row = {...base, ...serviceInfo, wa_cp, current_date: current.repair_date, expected_date: expectedTxt, early_months: early, hari: hariSejak, telat_hari: Math.max(0,telat), status: early > 0 ? `Datang Lebih Awal ${early} bln` : 'Sudah Datang'}
      sudahDatang.push(row)
      if(early > 0) datangAwal.push(row)
    } else if(isDue){
      const row = {...base, ...serviceInfo, wa_cp, expected_date: expectedTxt, hari: hariSejak, telat_hari: Math.max(0,telat), status:'Due Service / Belum Datang'}
      belumDatang.push(row); due.push(row)
      if(hariSejak >= 180) lost.push({...row, status:'Lost Customer'})
    }
  })
  const customerBaru = currentFiltered.filter(r => !oldVehicleAllSA.has(vehicleKey(r))).map(r => ({...r, wa_cp: phoneForKey(vehicleKey(r)), status:'Customer Baru'}))
  return {pembanding,sudahDatang,datangAwal,belumDatang,due,lost,customerBaru,currentFiltered,oldFiltered}
}

async function replaceTable(table, rows){
  if(!supabase) throw new Error('Supabase belum disetting. Isi file .env dulu.')
  const { error: delErr } = await supabase.from(table).delete().neq('id', 0)
  if(delErr) throw delErr
  // Insert semua baris, dibagi batch supaya file besar tidak gagal.
  for(let i=0;i<rows.length;i+=500){
    const { error } = await supabase.from(table).insert(rows.slice(i,i+500))
    if(error) throw error
  }
}
async function fetchRows(table){
  if(!supabase) return []
  // Supabase/PostgREST sering membatasi 1000 baris per request.
  // v7 mengambil data pakai pagination agar semua baris terbaca.
  const all = []
  const pageSize = 1000
  for(let from=0; ; from += pageSize){
    const to = from + pageSize - 1
    const { data, error } = await supabase.from(table).select('*').order('repair_date',{ascending:false}).range(from, to)
    if(error) throw error
    all.push(...(data || []))
    if(!data || data.length < pageSize) break
  }
  return all
}

export default function App(){
  const [oldRows,setOldRows] = useState([])
  const [currentRows,setCurrentRows] = useState([])
  const [period,setPeriod] = useState(6)
  const [typeMode,setTypeMode] = useState('ALL')
  const [saMode,setSaMode] = useState('ALL')
  const [sampaiTanggal,setSampaiTanggal] = useState(new Date().toISOString().slice(0,10))
  const [detail,setDetail] = useState('due')
  const [search,setSearch] = useState('')
  const [msg,setMsg] = useState('')
  const [loading,setLoading] = useState(false)

  async function loadData(){
    try{ setLoading(true); const [oldData, currentData] = await Promise.all([fetchRows('job_history_old'), fetchRows('job_history_current')]); setOldRows(oldData); setCurrentRows(currentData); setMsg(`Data dari Supabase terbaca: Data Lama ${oldData.length.toLocaleString('id-ID')} baris, Bulan Berjalan ${currentData.length.toLocaleString('id-ID')} baris.`) }
    catch(err){ setMsg(err.message) } finally{ setLoading(false) }
  }
  useEffect(()=>{ loadData() },[])

  function uploadTo(table, label){
    return e => {
      const file = e.target.files?.[0]
      if(!file) return
      if(!confirm(`${label} akan REPLACE data lama di tabel ${table}. Lanjutkan?`)) return
      setLoading(true); setMsg(`Membaca ${label}...`)
      parseAllSheets(file, async (rows, sheets)=>{
        try{ await replaceTable(table, rows); setMsg(`${label} berhasil disimpan FULL ke Supabase: ${rows.length.toLocaleString('id-ID')} baris OIL/SBE dari ${sheets} sheet.`); await loadData() }
        catch(err){ setMsg(err.message) } finally{ setLoading(false) }
      }, err=>{ setMsg(err.message); setLoading(false) })
    }
  }
  async function resetCurrent(){ if(!confirm('DELETE ALL data Bulan Berjalan di Supabase? Data Lama tetap aman.')) return; try{ setLoading(true); await replaceTable('job_history_current', []); setMsg('DELETE ALL Bulan Berjalan berhasil.'); await loadData() } catch(err){ setMsg(err.message) } finally{ setLoading(false) } }
  async function resetAll(){ if(!confirm('Hapus Data Lama dan Bulan Berjalan di Supabase?')) return; try{ setLoading(true); await replaceTable('job_history_current', []); await replaceTable('job_history_old', []); setMsg('Semua data Supabase sudah dikosongkan.'); await loadData() } catch(err){ setMsg(err.message) } finally{ setLoading(false) } }

  const saList = useMemo(()=> ['ALL', ...Array.from(new Set([...oldRows,...currentRows].map(r=>norm(r.sa)).filter(Boolean))).sort()], [oldRows,currentRows])
  const a = useMemo(()=> buildAnalytics(oldRows,currentRows,period,sampaiTanggal,typeMode,saMode), [oldRows,currentRows,period,sampaiTanggal,typeMode,saMode])
  const detailRows = {sudah:a.sudahDatang, awal:a.datangAwal, belum:a.belumDatang, baru:a.customerBaru, due:a.due, lost:a.lost}[detail] || []
  const shown = detailRows.filter(r => !search || upper(r.police_no).includes(upper(search)) || upper(r.chassis_no).includes(upper(search)) || upper(r.customer_name).includes(upper(search)) || upper(r.sa).includes(upper(search)) || upper(r.wa_cp).includes(upper(search)))
  const repeatRate = a.pembanding.length ? Math.round((a.sudahDatang.length/a.pembanding.length)*100) : 0

  function exportExcel(){
    const exportData = shown.map(r => ({Plat:r.police_no,'No Rangka':r.chassis_no||'',Customer:r.customer_name,'WA CP':r.wa_cp||'',SA:r.sa||'','Last Service / Tgl Pembanding':r.repair_date,'SBE Terakhir':r.last_sbe_km||'','Next Service':r.next_service||'','Datang Lagi Bulan Berjalan':r.current_date||'','Estimasi Jadwal':r.expected_date||'',Type:r.repair_type,Status:r.status||'','Lebih Awal':r.early_months?`${r.early_months} bulan`:'','Hari Sejak Service':r.hari||'','Telat Hari':r.telat_hari||''}))
    const ws = XLSX.utils.json_to_sheet(exportData); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Detail'); XLSX.writeFile(wb, `THS_${detail}_${period}bulan_${sampaiTanggal}.xlsx`)
  }

  return <div className="page">
    <header><div><h1>THS Analytics Online v7</h1><p>Supabase + Full Import Semua Baris + No Rangka</p></div><button onClick={loadData}><RefreshCw size={16}/> Refresh</button></header>
    <section className="panel uploadGrid">
      <div className="uploadBox"><h3><Database size={18}/> Upload Data Lama / Pembanding</h3><p>Isi histori sampai bulan lalu. Upload akan mengganti isi tabel <b>job_history_old</b>.</p><input type="file" accept=".xlsx,.xls" onChange={uploadTo('job_history_old','Data Lama / Pembanding')}/><b>{oldRows.length.toLocaleString('id-ID')} baris aktif</b></div>
      <div className="uploadBox current"><h3><Upload size={18}/> Upload Bulan Berjalan</h3><p>Khusus bulan aktif. Upload ulang akan mengganti isi tabel <b>job_history_current</b>.</p><input type="file" accept=".xlsx,.xls" onChange={uploadTo('job_history_current','Bulan Berjalan')}/><b>{currentRows.length.toLocaleString('id-ID')} baris aktif</b><button className="danger" onClick={resetCurrent}><Trash2 size={15}/> Delete All Bulan Berjalan</button></div>
    </section>
    <section className="panel controls"><label>Periode Service <select value={period} onChange={e=>setPeriod(Number(e.target.value))}><option value={6}>6 Bulan</option><option value={12}>12 Bulan / 1 Tahun</option></select></label><label>Sampai Tanggal <input type="date" value={sampaiTanggal} onChange={e=>setSampaiTanggal(e.target.value)}/></label><label>Repair Type <select value={typeMode} onChange={e=>setTypeMode(e.target.value)}><option value="ALL">OIL + SBE</option><option value="OIL">OIL</option><option value="SBE">SBE</option></select></label><label>SA <select value={saMode} onChange={e=>setSaMode(e.target.value)}>{saList.map(sa=><option key={sa} value={sa}>{sa==='ALL'?'Semua SA':sa}</option>)}</select></label><button className="danger secondary" onClick={resetAll}>Reset Semua Data Supabase</button></section>
    {msg && <div className="msg">{msg}</div>}{loading && <div className="msg">Sedang proses, tunggu sebentar...</div>}
    <section className="cards"><Card icon={<Database/>} title="Customer Pembanding Due" value={a.pembanding.length}/><Card icon={<UserCheck/>} title="Sudah Datang" value={a.sudahDatang.length} onClick={()=>setDetail('sudah')}/><Card icon={<Clock/>} title="Datang Lebih Awal" value={a.datangAwal.length} onClick={()=>setDetail('awal')}/><Card icon={<UserX/>} title="Belum Datang" value={a.belumDatang.length} onClick={()=>setDetail('belum')}/><Card icon={<UserPlus/>} title="Customer Baru" value={a.customerBaru.length} onClick={()=>setDetail('baru')}/><Card icon={<Users/>} title="Repeat Rate" value={repeatRate+'%'}/><Card icon={<UserX/>} title="Lost Customer" value={a.lost.length} onClick={()=>setDetail('lost')}/></section>
    <section className="panel summary"><h2>Jawaban untuk Atasan</h2><p>Per tanggal <b>{new Date(sampaiTanggal).getDate()}</b>, dari Data Lama ditemukan <b>{a.pembanding.length}</b> customer yang masuk jadwal service {period} bulan. Yang sudah datang di Bulan Berjalan <b>{a.sudahDatang.length}</b>, datang lebih awal <b>{a.datangAwal.length}</b>, belum datang/due <b>{a.belumDatang.length}</b>, customer baru <b>{a.customerBaru.length}</b>. Repeat rate saat ini <b>{repeatRate}%</b>.</p>{currentRows.length===0 && <p className="note">Catatan: Data Bulan Berjalan masih kosong, jadi dashboard hanya menghitung customer yang waktunya service dari Data Lama.</p>}</section>
    <section className="panel"><div className="detailHead"><div><h2>Detail Data</h2><div className="tabs"><button className={detail==='sudah'?'active':''} onClick={()=>setDetail('sudah')}>Sudah Datang</button><button className={detail==='awal'?'active':''} onClick={()=>setDetail('awal')}>Datang Lebih Awal</button><button className={detail==='belum'?'active':''} onClick={()=>setDetail('belum')}>Belum Datang</button><button className={detail==='baru'?'active':''} onClick={()=>setDetail('baru')}>Customer Baru</button><button className={detail==='due'?'active':''} onClick={()=>setDetail('due')}>Due Service</button><button className={detail==='lost'?'active':''} onClick={()=>setDetail('lost')}>Lost Customer</button></div></div><div className="actionRight"><button className="exportBtn" onClick={exportExcel}><Download size={16}/> Export Excel</button><div className="search"><Search size={16}/><input placeholder="Cari plat / no rangka / customer / SA / WA" value={search} onChange={e=>setSearch(e.target.value)}/></div></div></div><div className="tableWrap"><table><thead><tr><th>Plat</th><th>No Rangka</th><th>Customer</th><th>WA CP</th><th>SA</th><th>Last Service</th><th>SBE Terakhir</th><th>Next Service</th><th>Datang Lagi</th><th>Estimasi Jadwal</th><th>Type</th><th>Status</th><th>Awal</th><th>Hari</th><th>Telat</th></tr></thead><tbody>{shown.map((r,i)=><tr key={i}><td>{r.police_no}</td><td>{r.chassis_no||''}</td><td>{r.customer_name}</td><td>{r.wa_cp||''}{firstPhoneForWa(r.wa_cp) && <a className="waBtn" href={`https://wa.me/${firstPhoneForWa(r.wa_cp)}`} target="_blank" rel="noreferrer">WA</a>}</td><td>{r.sa}</td><td>{r.repair_date}</td><td>{r.last_sbe_km||''}</td><td>{r.next_service||''}</td><td>{r.current_date||''}</td><td>{r.expected_date||''}</td><td>{r.repair_type}</td><td>{r.status||''}</td><td>{r.early_months?`${r.early_months} bln`:''}</td><td>{r.hari||''}</td><td>{r.telat_hari?`${r.telat_hari} hr`:''}</td></tr>)}</tbody></table></div></section>
  </div>
}
function Card({icon,title,value,onClick}){ return <button className="card" onClick={onClick}><span>{icon}</span><small>{title}</small><b>{value}</b></button> }
