"""
CARGA DE DATOS A SUPABASE - HISTÓRICO NOORD
=============================================
Lee los archivos JSON del respaldo y los sube a las tablas de Supabase.
Sube en lotes para no saturar la API.

INSTRUCCIONES:
1. Pon tu SUPABASE_URL y SUPABASE_KEY abajo
2. Asegúrate de que la carpeta respaldo_noord/ esté junto a este script
3. Corre: python cargar_supabase.py
"""

import json
import os
import requests
import time
from datetime import datetime

# ============================================================
# CONFIGURACIÓN - CAMBIA ESTAS DOS LÍNEAS
# ============================================================
SUPABASE_URL = "PEGA_TU_PROJECT_URL_AQUI"      # ej: https://abcdxyz.supabase.co
SUPABASE_KEY = "PEGA_TU_SERVICE_ROLE_KEY_AQUI" # la clave service_role (larga)
# ============================================================

CARPETA = "respaldo_noord"
LOTE = 500  # registros por lote

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}


def cargar_json(nombre):
    ruta = os.path.join(CARPETA, f"{nombre}.json")
    if not os.path.exists(ruta):
        print(f"  ⚠ No existe {nombre}.json, saltando")
        return None
    with open(ruta, "r", encoding="utf-8") as f:
        return json.load(f)


def ts_iso(valor):
    """Convierte timestamp de HubSpot a formato ISO para Postgres."""
    if not valor:
        return None
    try:
        n = int(valor)
        if n > 9999999999:  # milisegundos
            return datetime.utcfromtimestamp(n / 1000).isoformat()
        return datetime.utcfromtimestamp(n).isoformat()
    except (ValueError, TypeError):
        try:
            return datetime.fromisoformat(str(valor).replace("Z", "+00:00")).isoformat()
        except Exception:
            return None


def get_contact_id(item):
    """Extrae el ID del contacto asociado a una actividad."""
    assoc = item.get("associations", {})
    for key in assoc:
        if "contact" in key.lower():
            lista = assoc[key].get("results", assoc[key]) if isinstance(assoc[key], dict) else assoc[key]
            if isinstance(lista, list) and lista:
                primero = lista[0]
                return str(primero.get("id") or primero.get("objectId") or primero.get("toObjectId") or "")
    return None


def subir_lote(tabla, registros):
    """Sube un lote de registros a una tabla de Supabase."""
    url = f"{SUPABASE_URL}/rest/v1/{tabla}"
    r = requests.post(url, headers=HEADERS, json=registros, timeout=60)
    if r.status_code not in (200, 201):
        print(f"  ✗ Error en {tabla}: {r.status_code} - {r.text[:200]}")
        return False
    return True


def cargar_tabla(tabla, registros):
    """Sube todos los registros de una tabla en lotes."""
    if not registros:
        return
    print(f"\n→ Cargando {tabla} ({len(registros):,} registros)...")
    total = len(registros)
    for i in range(0, total, LOTE):
        lote = registros[i:i + LOTE]
        exito = subir_lote(tabla, lote)
        if not exito:
            print(f"  ⚠ Falló el lote {i}-{i+len(lote)}, reintentando...")
            time.sleep(2)
            subir_lote(tabla, lote)
        if (i // LOTE) % 10 == 0 and i > 0:
            print(f"  ... {i:,}/{total:,}")
        time.sleep(0.1)
    print(f"  ✓ {tabla} completado")


def verificar_conexion():
    if "PEGA_TU" in SUPABASE_URL or "PEGA_TU" in SUPABASE_KEY:
        print("✗ ERROR: Falta poner SUPABASE_URL y SUPABASE_KEY en el script.")
        return False
    url = f"{SUPABASE_URL}/rest/v1/owners?select=id&limit=1"
    r = requests.get(url, headers=HEADERS, timeout=10)
    if r.status_code == 200:
        print("✓ Conexión a Supabase exitosa")
        return True
    print(f"✗ Error de conexión: {r.status_code} - {r.text[:200]}")
    return False


if __name__ == "__main__":
    print("=" * 50)
    print("CARGA A SUPABASE - HISTÓRICO NOORD")
    print("=" * 50)

    if not verificar_conexion():
        exit(1)

    inicio = datetime.now()

    # 1. OWNERS
    owners = cargar_json("owners")
    if owners:
        registros = [{
            "id": str(o.get("id")),
            "first_name": o.get("firstName"),
            "last_name": o.get("lastName"),
            "email": o.get("email")
        } for o in owners]
        cargar_tabla("owners", registros)

    # 2. CONTACTS
    contacts = cargar_json("contacts")
    if contacts:
        registros = []
        for c in contacts:
            p = c.get("properties", {})
            registros.append({
                "id": str(c.get("id")),
                "firstname": p.get("firstname"),
                "lastname": p.get("lastname"),
                "email": p.get("email"),
                "phone": p.get("phone"),
                "mobilephone": p.get("mobilephone"),
                "company": p.get("company"),
                "lifecyclestage": p.get("lifecyclestage"),
                "lead_status": p.get("hs_lead_status"),
                "owner_id": p.get("hubspot_owner_id"),
                "createdate": ts_iso(p.get("createdate")) if p.get("createdate") and str(p.get("createdate")).isdigit() else (p.get("createdate") or None),
                "raw": p
            })
        cargar_tabla("contacts", registros)

    # 3. DEALS
    deals = cargar_json("deals")
    if deals:
        registros = []
        for d in deals:
            p = d.get("properties", {})
            amount = None
            try:
                amount = float(p.get("amount")) if p.get("amount") else None
            except (ValueError, TypeError):
                amount = None
            registros.append({
                "id": str(d.get("id")),
                "dealname": p.get("dealname"),
                "amount": amount,
                "dealstage": p.get("dealstage"),
                "pipeline": p.get("pipeline"),
                "owner_id": p.get("hubspot_owner_id"),
                "contact_id": get_contact_id(d),
                "createdate": ts_iso(p.get("createdate")) if p.get("createdate") and str(p.get("createdate")).isdigit() else (p.get("createdate") or None),
                "raw": p
            })
        cargar_tabla("deals", registros)

    # 4. NOTES
    notes = cargar_json("notes")
    if notes:
        registros = []
        for n in notes:
            p = n.get("properties", {})
            registros.append({
                "id": str(n.get("id")),
                "contact_id": get_contact_id(n),
                "body": p.get("hs_note_body"),
                "owner_id": p.get("hubspot_owner_id"),
                "timestamp": ts_iso(p.get("hs_timestamp")),
                "raw": p
            })
        cargar_tabla("notes", registros)

    # 5. CALLS
    calls = cargar_json("calls")
    if calls:
        registros = []
        for c in calls:
            p = c.get("properties", {})
            registros.append({
                "id": str(c.get("id")),
                "contact_id": get_contact_id(c),
                "body": p.get("hs_call_body"),
                "duration": p.get("hs_call_duration"),
                "owner_id": p.get("hubspot_owner_id"),
                "timestamp": ts_iso(p.get("hs_timestamp")),
                "raw": p
            })
        cargar_tabla("calls", registros)

    # 6. MEETINGS
    meetings = cargar_json("meetings")
    if meetings:
        registros = []
        for m in meetings:
            p = m.get("properties", {})
            registros.append({
                "id": str(m.get("id")),
                "contact_id": get_contact_id(m),
                "title": p.get("hs_meeting_title"),
                "body": p.get("hs_meeting_body"),
                "owner_id": p.get("hubspot_owner_id"),
                "timestamp": ts_iso(p.get("hs_timestamp")),
                "raw": p
            })
        cargar_tabla("meetings", registros)

    # 7. TASKS
    tasks = cargar_json("tasks")
    if tasks:
        registros = []
        for t in tasks:
            p = t.get("properties", {})
            registros.append({
                "id": str(t.get("id")),
                "contact_id": get_contact_id(t),
                "subject": p.get("hs_task_subject"),
                "body": p.get("hs_task_body"),
                "status": p.get("hs_task_status"),
                "owner_id": p.get("hubspot_owner_id"),
                "timestamp": ts_iso(p.get("hs_timestamp")),
                "raw": p
            })
        cargar_tabla("tasks", registros)

    fin = datetime.now()
    dur = (fin - inicio).seconds
    print("\n" + "=" * 50)
    print(f"✅ CARGA COMPLETADA en {dur // 60} min {dur % 60} seg")
    print("=" * 50)
    print("Verifica en Supabase → Table Editor que los datos estén ahí.")
