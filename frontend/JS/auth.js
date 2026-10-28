// =========================================================
// AUTH.JS — se incluye PRIMERO en todas las páginas:
//     <script src="JS/auth.js"></script>
//
// 1. Envía la sesión (cookie) en todas las llamadas a la API.
// 2. Si no hay sesión → login.html. Si la API responde 401 → login.html.
// 3. Página protegida:  <body data-permisos="caja.ver|caja.operar">  (basta uno)
// 4. Oculta cualquier elemento con  data-permiso="inventario.editar|compras.editar"
//    si el usuario no tiene ninguno de esos permisos (también en contenido dinámico).
//    data-editar="clientes.editar" en un contenedor oculta sus botones .btn-editar/.btn-eliminar.
// 5. Muestra usuario, rol, "Cambiar contraseña" y "Cerrar sesión" en el encabezado.
// 6. Expone:  window.puede("codigo", ...)  y  window.sesionLista (Promise con el usuario)
// =========================================================
(function () {
    const API_ORIG = "http://localhost:3000";
    // La cookie de sesión solo viaja si página y API usan el MISMO host.
    // Si abres la página como 127.0.0.1, la API también se llama por 127.0.0.1.
    const host = location.hostname;
    const API = host && host !== "localhost" ? `http://${host}:3000` : API_ORIG;
    const esLogin = /login\.html$/i.test(location.pathname);

    // ---------- fetch con sesión ----------
    const _fetch = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
        let url = typeof input === "string" ? input : input.url;
        if (url.startsWith(API_ORIG) || url.startsWith(API)) {
            url = API + url.slice(url.startsWith(API_ORIG) ? API_ORIG.length : API.length);
            return _fetch(url, { credentials: "include", ...init }).then(res => {
                if (res.status === 401 && !esLogin && !/\/(login|cambiar-clave)$/.test(url)) irALogin();
                return res;
            });
        }
        return _fetch(input, init);
    };

    function irALogin() {
        if (!esLogin) location.href = "login.html";
    }

    // Oculta la página hasta saber quién es (evita ver un instante lo que no corresponde)
    const estilo = document.createElement("style");
    estilo.textContent = `
        html.auth-cargando body { visibility: hidden; }
        .auth-oculto { display: none !important; }
        /* data-editar="permiso": sin ese permiso, oculta los botones de editar/eliminar de las tablas */
        .solo-lectura .btn-editar, .solo-lectura .btn-eliminar, .solo-lectura .btn-salida { display: none !important; }
        .auth-chip { position: relative; display: inline-flex; align-items: center; gap: .5rem; margin-left: auto; }
        .header .auth-chip { margin-left: auto; margin-right: .75rem; }
        .auth-btn { background: rgba(255,255,255,.15); color: #fff; border: none; border-radius: 8px;
                    padding: .45rem .8rem; cursor: pointer; font: inherit; font-size: .9rem; display: inline-flex; gap: .5rem; align-items: center; }
        .auth-btn small { opacity: .8; }
        .auth-menu { position: absolute; right: 0; top: 110%; background: #fff; color: #222; border-radius: 10px;
                     box-shadow: 0 8px 24px rgba(0,0,0,.18); min-width: 220px; padding: .4rem; z-index: 3000; }
        .auth-menu[hidden] { display: none; }
        .auth-menu .info { padding: .5rem .7rem; border-bottom: 1px solid #eee; font-size: .85rem; color: #555; }
        .auth-menu button { width: 100%; text-align: left; background: none; border: none; padding: .55rem .7rem;
                            border-radius: 6px; cursor: pointer; font: inherit; font-size: .9rem; color: #222; }
        .auth-menu button:hover { background: #f5f5f5; }
        .auth-modal { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: grid; place-items: center; z-index: 4000; padding: 16px; }
        .auth-caja { background: #fff; color: #222; border-radius: 12px; padding: 1.5rem; width: 100%; max-width: 400px;
                     font-family: "Inter", "Segoe UI", Arial, sans-serif; }
        .auth-caja h3 { margin: 0 0 .5rem; color: #b71c1c; }
        .auth-caja p { color: #555; font-size: .9rem; margin: 0 0 1rem; }
        .auth-caja label { display: block; font-size: .82rem; font-weight: 600; margin-bottom: .75rem; }
        .auth-caja input { width: 100%; box-sizing: border-box; padding: .6rem; border: 1px solid #ccc; border-radius: 8px; font: inherit; margin-top: .25rem; }
        .auth-caja .acc { display: flex; gap: .5rem; justify-content: flex-end; }
        .auth-caja .acc button { border: none; border-radius: 8px; padding: .6rem 1rem; cursor: pointer; font: inherit; font-weight: 600; }
        .auth-caja .rojo { background: #b71c1c; color: #fff; }
        .auth-caja .gris { background: #eceff1; color: #333; }
        .auth-caja .error { color: #b71c1c; font-size: .85rem; min-height: 1.2em; margin: 0 0 .5rem; }
        .auth-denegado { max-width: 520px; margin: 4rem auto; text-align: center; font-family: "Inter", "Segoe UI", Arial, sans-serif; padding: 0 16px; }
        .auth-denegado h2 { color: #b71c1c; }
        .auth-denegado a { color: #b71c1c; font-weight: 600; }
    `;
    document.head.appendChild(estilo);
    if (!esLogin) document.documentElement.classList.add("auth-cargando");

    let usuario = null;
    window.puede = (...codigos) => !!usuario && codigos.some(c => usuario.permisos.includes(c));

    // Oculta elementos con data-permiso que el usuario no tiene
    function aplicar(raiz) {
        const lectura = raiz.querySelectorAll ? [...raiz.querySelectorAll("[data-editar]")] : [];
        if (raiz.dataset && raiz.dataset.editar) lectura.push(raiz);
        lectura.forEach(el => el.classList.toggle("solo-lectura",
            !el.dataset.editar.split("|").some(c => window.puede(c.trim()))));
        const lista = raiz.querySelectorAll ? [...raiz.querySelectorAll("[data-permiso]")] : [];
        if (raiz.dataset && raiz.dataset.permiso) lista.push(raiz);
        lista.forEach(el => {
            const ok = el.dataset.permiso.split("|").some(c => window.puede(c.trim()));
            el.classList.toggle("auth-oculto", !ok);
        });
    }

    const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    // ---------- cambio de contraseña ----------
    async function textoPolitica() {
        try {
            const p = await (await fetch(API_ORIG + "/politica-clave")).json();
            const r = [`mínimo ${p.min_longitud} caracteres`];
            if (p.requiere_letra) r.push("letras");
            if (p.requiere_numero) r.push("números");
            if (p.requiere_mayuscula) r.push("una mayúscula");
            if (p.requiere_simbolo) r.push("un símbolo");
            return { texto: r.join(", "), min: p.min_longitud };
        } catch { return { texto: "", min: 1 }; }
    }

    async function cambiarClave(obligatorio = false) {
        const pol = await textoPolitica();
        const m = document.createElement("div");
        m.className = "auth-modal";
        m.innerHTML = `
            <form class="auth-caja">
                <h3>${obligatorio ? "Cree su contraseña" : "Cambiar contraseña"}</h3>
                <p>${obligatorio ? "Su contraseña es temporal o ya no cumple los requisitos. Cree una nueva para continuar." : ""}
                   ${pol.texto ? `<br><b>Requisitos:</b> ${esc(pol.texto)}.` : ""}</p>
                <label>Contraseña actual<input type="password" name="actual" required autocomplete="current-password"></label>
                <label>Nueva contraseña<input type="password" name="nueva" required minlength="${pol.min}" autocomplete="new-password"></label>
                <label>Repetir nueva<input type="password" name="repetir" required minlength="${pol.min}" autocomplete="new-password"></label>
                <div class="error"></div>
                <div class="acc">
                    ${obligatorio ? `<button type="button" class="gris" data-salir>Cerrar sesión</button>` : `<button type="button" class="gris" data-cancelar>Cancelar</button>`}
                    <button type="submit" class="rojo">Guardar</button>
                </div>
            </form>`;
        document.body.appendChild(m);
        const f = m.querySelector("form"), error = m.querySelector(".error");
        m.querySelector("[data-cancelar]")?.addEventListener("click", () => m.remove());
        m.querySelector("[data-salir]")?.addEventListener("click", cerrarSesion);
        f.addEventListener("submit", async e => {
            e.preventDefault();
            if (f.nueva.value !== f.repetir.value) { error.textContent = "Las contraseñas nuevas no coinciden"; return; }
            const r = await fetch(API_ORIG + "/cambiar-clave", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ actual: f.actual.value, nueva: f.nueva.value })
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) { error.textContent = d.message || "No se pudo cambiar"; return; }
            m.remove();
            if (typeof notificarSistema === "function") notificarSistema("Contraseña actualizada", "exito");
            if (obligatorio) location.reload();   // el servidor ya permite usar el sistema
        });
        f.actual.focus();
    }

    async function cerrarSesion() {
        await fetch(API_ORIG + "/logout", { method: "POST" }).catch(() => {});
        location.href = "login.html";
    }

    // ---------- chip de usuario en el encabezado ----------
    function pintarUsuario() {
        const cont = document.getElementById("user-info") || document.querySelector(".header");
        if (!cont) return;
        const chip = document.createElement("div");
        chip.className = "auth-chip";
        chip.innerHTML = `
            <button type="button" class="auth-btn" title="Mi cuenta">
                <i class="fas fa-user-circle"></i> ${esc(usuario.nombre)} <small>· ${esc(usuario.rol_nombre)}</small>
            </button>
            <div class="auth-menu" hidden>
                <div class="info">${usuario.trabajador ? esc(usuario.trabajador) + "<br>" : ""}${esc(usuario.rol_nombre)}</div>
                <button type="button" data-a="clave"><i class="fas fa-key"></i> Cambiar contraseña</button>
                <button type="button" data-a="salir"><i class="fas fa-sign-out-alt"></i> Cerrar sesión</button>
            </div>`;
        const menu = chip.querySelector(".auth-menu");
        chip.querySelector(".auth-btn").addEventListener("click", e => { e.stopPropagation(); menu.hidden = !menu.hidden; });
        document.addEventListener("click", () => menu.hidden = true);
        chip.querySelector('[data-a="clave"]').addEventListener("click", () => cambiarClave(false));
        chip.querySelector('[data-a="salir"]').addEventListener("click", cerrarSesion);
        // Si hay botón "Volver", el chip va justo antes
        const volver = cont.querySelector(".btn-volver");
        if (volver && volver.parentElement === cont) cont.insertBefore(chip, volver); else cont.appendChild(chip);
    }

    function denegar() {
        document.body.innerHTML = `
            <div class="auth-denegado">
                <h2><i class="fas fa-lock"></i> Sin acceso</h2>
                <p>Su rol (<b>${esc(usuario.rol_nombre)}</b>) no tiene acceso a esta sección.</p>
                <p><a href="index.html">Volver al inicio</a></p>
            </div>`;
    }

    // ---------- verificación de sesión ----------
    window.sesionLista = (async () => {
        if (esLogin) return null;
        let d;
        try {
            const r = await fetch(API_ORIG + "/check-session");
            d = await r.json();
        } catch {
            document.documentElement.classList.remove("auth-cargando");
            return null;   // servidor apagado: cada página mostrará su propio error
        }
        if (!d.loggedIn) { irALogin(); return null; }
        usuario = d.user;
        window.USUARIO = usuario;

        const listo = () => {
            const req = document.body.dataset.permisos;
            if (req && !req.split("|").some(c => window.puede(c.trim()))) {
                denegar();
            } else {
                aplicar(document.body);
                new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && aplicar(n))))
                    .observe(document.body, { childList: true, subtree: true });
                pintarUsuario();
                if (usuario.debe_cambiar_clave) cambiarClave(true);
            }
            document.documentElement.classList.remove("auth-cargando");
        };
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", listo); else listo();
        return usuario;
    })();
})();
