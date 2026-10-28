// =========================================================
// USUARIOS Y ROLES
// =========================================================
const API = "http://localhost:3000";

let usuarios = [], roles = [], permisos = [], trabajadores = [];
let matriz = {};          // { id_rol: Set(codigos) }  (estado editado)
let original = {};        // copia para detectar cambios
let editando = null;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fecha = s => s ? new Date(s.replace(" ", "T")).toLocaleString("es-NI", { dateStyle: "short", timeStyle: "short" }) : "Nunca";

async function api(ruta, op = {}) {
    const res = await fetch(API + ruta, {
        headers: { "Content-Type": "application/json" }, ...op,
        body: op.body ? JSON.stringify(op.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Error del servidor");
    return data;
}

// ---------- pestañas ----------
document.querySelectorAll(".tab[data-tab]").forEach(t => t.addEventListener("click", () => {
    document.querySelectorAll(".tab[data-tab]").forEach(x => x.classList.toggle("activo", x === t));
    ["usuarios", "roles", "config"].forEach(n => $("panel-" + n).hidden = n !== t.dataset.tab);
}));

const optsRoles = sel => roles.map(r => `<option value="${r.id_rol}" ${r.id_rol == sel ? "selected" : ""}>${esc(r.nombre)}</option>`).join("");
const optsTrab = sel => `<option value="">— Ninguno —</option>` + trabajadores.map(t =>
    `<option value="${t.id_trab}" ${t.id_trab == sel ? "selected" : ""}>${esc(t.pr_name)} ${esc(t.pr_lastname)}${t.puesto ? " · " + esc(t.puesto) : ""}</option>`).join("");

// =========================================================
// USUARIOS
// =========================================================
async function cargarUsuarios() {
    usuarios = await api("/usuarios");
    const admin = puede("usuarios.admin");
    $("tablaUsuarios").innerHTML = usuarios.map(u => `
        <tr style="${u.activo ? "" : "opacity:.55"}">
            <td><b>${esc(u.name_user)}</b>${u.id_user === USUARIO.id ? ' <span class="badge pedido">Usted</span>' : ""}</td>
            <td>${u.trabajador ? `${esc(u.trabajador)}${u.puesto ? `<br><small>${esc(u.puesto)}</small>` : ""}` : "<small>—</small>"}</td>
            <td>${esc(u.rol_nombre)}</td>
            <td>${fecha(u.ultimo_acceso)}${u.debe_cambiar_clave ? '<br><span class="badge gris">Clave temporal</span>' : ""}</td>
            <td>${u.activo ? '<span class="badge ok">Activo</span>' : '<span class="badge gris">Desactivado</span>'}</td>
            <td class="CRUD">
                ${admin ? `<button class="btn-icon" title="Editar rol / estado" data-ed="${u.id_user}"><i class="fas fa-pen"></i></button>` : ""}
                <button class="btn-icon" title="Restablecer contraseña" data-cl="${u.id_user}"><i class="fas fa-key"></i></button>
            </td>
        </tr>`).join("");
}

$("formUsuario").addEventListener("submit", async e => {
    e.preventDefault();
    try {
        const r = await api("/usuarios", { method: "POST", body: {
            name_user: $("u_nombre").value.trim(), clave: $("u_clave").value,
            id_rol: $("u_rol").value, id_trab: $("u_trab").value || null
        }});
        notificarSistema(r.message, "exito", 6000);
        e.target.reset();
        cargarUsuarios();
    } catch (err) { notificarSistema(err.message, "error"); }
});

$("tablaUsuarios").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    const u = usuarios.find(x => x.id_user == (b.dataset.ed || b.dataset.cl));
    editando = u.id_user;
    if (b.dataset.ed) {
        $("eTitulo").textContent = `Editar ${u.name_user}`;
        $("e_rol").innerHTML = optsRoles(u.id_rol);
        $("e_trab").innerHTML = optsTrab(u.id_trab);
        $("e_activo").checked = !!u.activo;
        $("modalUsuario").hidden = false;
    } else {
        $("cTitulo").textContent = `Restablecer contraseña de ${u.name_user}`;
        $("formClave").reset();
        $("modalClave").hidden = false;
    }
});

$("formEditar").addEventListener("submit", async e => {
    e.preventDefault();
    try {
        const r = await api(`/usuarios/${editando}`, { method: "PUT", body: {
            id_rol: $("e_rol").value, id_trab: $("e_trab").value || null, activo: $("e_activo").checked
        }});
        notificarSistema(r.message, "exito");
        $("modalUsuario").hidden = true;
        cargarUsuarios();
    } catch (err) { notificarSistema(err.message, "error"); }
});

$("formClave").addEventListener("submit", async e => {
    e.preventDefault();
    try {
        const r = await api(`/usuarios/${editando}/clave`, { method: "PUT", body: { clave: $("c_clave").value } });
        notificarSistema(r.message, "exito");
        $("modalClave").hidden = true;
        cargarUsuarios();
    } catch (err) { notificarSistema(err.message, "error"); }
});

// =========================================================
// MATRIZ ROLES × PERMISOS
// =========================================================
function pintarMatriz() {
    $("matrizHead").innerHTML = `<tr><th>Permiso</th>${roles.map(r =>
        `<th class="rol" title="${esc(r.descripcion || "")}">${esc(r.nombre)}</th>`).join("")}</tr>`;
    let modulo = "", html = "";
    permisos.forEach(p => {
        if (p.modulo !== modulo) {
            modulo = p.modulo;
            html += `<tr class="modulo"><td colspan="${roles.length + 1}">${esc(modulo)}</td></tr>`;
        }
        html += `<tr><td class="p">${esc(p.descripcion)}<small>${esc(p.codigo)}</small></td>${roles.map(r => {
            const on = matriz[r.id_rol].has(p.codigo);
            const cambio = on !== original[r.id_rol].has(p.codigo);
            return `<td class="c"><input type="checkbox" data-rol="${r.id_rol}" data-p="${p.codigo}" ${on ? "checked" : ""} class="${cambio ? "cambiado" : ""}"></td>`;
        }).join("")}</tr>`;
    });
    $("matrizBody").innerHTML = html;
    const n = rolesCambiados().length;
    $("cambiosTxt").textContent = n ? `${n} rol(es) con cambios sin guardar` : "";
}

const rolesCambiados = () => roles.filter(r => {
    const a = matriz[r.id_rol], b = original[r.id_rol];
    return a.size !== b.size || [...a].some(x => !b.has(x));
});

$("matrizBody").addEventListener("change", e => {
    const c = e.target;
    if (!c.dataset.rol) return;
    const set = matriz[c.dataset.rol];
    c.checked ? set.add(c.dataset.p) : set.delete(c.dataset.p);
    pintarMatriz();
});

$("btnDeshacer").addEventListener("click", () => {
    roles.forEach(r => matriz[r.id_rol] = new Set(original[r.id_rol]));
    pintarMatriz();
});

$("btnGuardarMatriz").addEventListener("click", async () => {
    const cambiados = rolesCambiados();
    if (!cambiados.length) return notificarSistema("No hay cambios", "info");
    if (!await confirmarSistema(`Se actualizarán los permisos de: <b>${cambiados.map(r => esc(r.nombre)).join(", ")}</b>.`, "Guardar permisos")) return;
    try {
        for (const r of cambiados)
            await api(`/roles/${r.id_rol}/permisos`, { method: "PUT", body: { permisos: [...matriz[r.id_rol]] } });
        notificarSistema("Permisos actualizados", "exito");
        await cargarRoles();
    } catch (err) { notificarSistema(err.message, "error"); await cargarRoles(); }
});

async function cargarRoles() {
    [roles, permisos] = await Promise.all([api("/roles"), api("/permisos")]);
    roles.forEach(r => { matriz[r.id_rol] = new Set(r.permisos); original[r.id_rol] = new Set(r.permisos); });
    pintarMatriz();
    $("u_rol").innerHTML = `<option value="">Seleccione…</option>` + optsRoles();
}

// =========================================================
// CONFIGURACIÓN
// =========================================================
function mostrarPolitica(p) {
    const r = [`mín. ${p.min_longitud}`];
    if (p.requiere_letra) r.push("letras");
    if (p.requiere_numero) r.push("números");
    if (p.requiere_mayuscula) r.push("mayúscula");
    if (p.requiere_simbolo) r.push("símbolo");
    ["u_clave", "c_clave"].forEach(id => { $(id).placeholder = r.join(", "); $(id).minLength = p.min_longitud; });
    $("polMin").value = p.min_longitud;
    $("polLetra").checked = p.requiere_letra;
    $("polNumero").checked = p.requiere_numero;
    $("polMayus").checked = p.requiere_mayuscula;
    $("polSimbolo").checked = p.requiere_simbolo;
}

$("formPolitica").addEventListener("submit", async e => {
    e.preventDefault();
    try {
        const r = await api("/configuracion", { method: "PUT", body: {
            clave_min_longitud: $("polMin").value,
            clave_requiere_letra: $("polLetra").checked,
            clave_requiere_numero: $("polNumero").checked,
            clave_requiere_mayuscula: $("polMayus").checked,
            clave_requiere_simbolo: $("polSimbolo").checked
        }});
        notificarSistema(r.message, "exito");
        mostrarPolitica(await api("/politica-clave"));
    } catch (err) { notificarSistema(err.message, "error"); }
});

$("formConfig").addEventListener("submit", async e => {
    e.preventDefault();
    try {
        const r = await api("/configuracion", { method: "PUT", body: { monto_aprobacion_compras: $("cfgMonto").value } });
        notificarSistema(r.message, "exito");
    } catch (err) { notificarSistema(err.message, "error"); }
});

document.querySelectorAll("[data-cerrar]").forEach(b => b.addEventListener("click", () => b.closest(".modal").hidden = true));

// =========================================================
// INICIO
// =========================================================
(async () => {
    await window.sesionLista;
    try {
        mostrarPolitica(await api("/politica-clave"));
        if (puede("usuarios.admin")) {
            const [trab, cfg] = await Promise.all([api("/trabajadores"), api("/configuracion")]);
            trabajadores = trab;
            $("u_trab").innerHTML = optsTrab();
            $("cfgMonto").value = cfg.monto_aprobacion_compras ?? 0;
            await cargarRoles();
        }
        await cargarUsuarios();
    } catch (err) { notificarSistema("No se pudo cargar: " + err.message, "error"); }
})();
