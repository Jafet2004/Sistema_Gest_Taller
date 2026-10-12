const API = "http://localhost:3000/vehiculos";
let vehiculoEditando = null;
let modoEdicion = false;

// ==============================
// FUNCIONES PARA MANEJAR FECHAS CORRECTAMENTE
// ==============================

function obtenerFechaHoraLocal() {
    const ahora = new Date();
    const offset = ahora.getTimezoneOffset();
    const fechaLocal = new Date(ahora.getTime() - (offset * 60 * 1000));
    const fechaStr = fechaLocal.toISOString().slice(0, 19).replace("T", " ");
    return fechaStr;
}

function formatearFechaLocal(fechaString) {
    if (!fechaString) return 'N/A';
    const fecha = new Date(fechaString);
    return fecha.toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

// ==============================
// INICIALIZACIÓN
// ==============================
document.addEventListener('DOMContentLoaded', function() {
    cargarClientes();
    cargarTrabajos();
    cargarVehiculos();
    
    // Limitar chasis a 16 caracteres
    const chasisInput = document.getElementById('Numero_chasis');
    chasisInput.addEventListener('input', function() {
        if (this.value.length > 16) {
            this.value = this.value.substring(0, 16);
        }
    });
    
    // Vista previa de imágenes
    const fotoInput = document.getElementById('foto_int');
    fotoInput.addEventListener('change', previewImages);
});

// ==============================
// PREVIEW DE MÚLTIPLES IMÁGENES
// ==============================
function previewImages() {
    const container = document.getElementById('preview-container');
    container.innerHTML = '';
    const files = this.files;
    
    if (files.length > 5) {
        mostrarError('Máximo 5 imágenes permitidas');
        this.value = '';
        return;
    }
    
    for (let i = 0; i < files.length; i++) {
        const reader = new FileReader();
        const file = files[i];
        
        reader.onload = function(e) {
            const imgContainer = document.createElement('div');
            imgContainer.className = 'preview-img';
            
            const img = document.createElement('img');
            img.src = e.target.result;
            
            const removeBtn = document.createElement('span');
            removeBtn.className = 'remove-img';
            removeBtn.innerHTML = '×';
            removeBtn.onclick = function() {
                imgContainer.remove();
            };
            
            imgContainer.appendChild(img);
            imgContainer.appendChild(removeBtn);
            container.appendChild(imgContainer);
        };
        
        reader.readAsDataURL(file);
    }
}

// ==============================
// CARGAR CLIENTES Y TRABAJOS
// ==============================
async function cargarClientes() {
    try {
        const res = await fetch("http://localhost:3000/clientes");
        const data = await res.json();

        const select = document.getElementById("id_client");
        select.innerHTML = `<option value="">Seleccione Cliente *</option>`;
        data.forEach(c => {
            select.innerHTML += `<option value="${c.id_client}">${c.pr_name} ${c.sc_name} ${c.pr_lastname} ${c.sc_lastname}</option>`;
        });
    } catch (error) {
        console.error('Error cargando clientes:', error);
    }
}

async function cargarTrabajos() {
    try {
        const res = await fetch("http://localhost:3000/trabajos");
        const data = await res.json();

        const select = document.getElementById("id_trabajo");
        select.innerHTML = `<option value="">Seleccione Trabajo *</option>`;
        data.forEach(t => {
            select.innerHTML += `<option value="${t.id_trabajo}">${t.Name_trabajo}</option>`;
        });
    } catch (error) {
        console.error('Error cargando trabajos:', error);
    }
}

// ==============================
// CONVERTIR FOTOS A BASE64
// ==============================
async function convertirImagenes(files) {
    const imagenes = [];
    for (let file of files) {
        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        imagenes.push(base64);
    }
    return imagenes;
}

// ==============================
// REGISTRAR VEHÍCULO (ENTRADA)
// ==============================
async function registrarVehiculo() {
    try {
        const Marca = document.getElementById("Marca").value.trim();
        const Modelo = document.getElementById("Modelo").value.trim();
        const Año = document.getElementById("Año").value.trim();
        const Numero_chasis = document.getElementById("Numero_chasis").value.trim();
        const id_client = document.getElementById("id_client").value;
        const id_trabajo = document.getElementById("id_trabajo").value;

        if (!Marca || !Modelo || !Numero_chasis || !id_client || !id_trabajo) {
            mostrarError('Por favor complete todos los campos obligatorios (*)');
            return;
        }

        if (Numero_chasis.length > 16) {
            mostrarError('El número de chasis no puede exceder 16 caracteres');
            return;
        }

        // Convertir múltiples imágenes
        const archivos = document.getElementById("foto_int").files;
        let foto_int = [];
        if (archivos.length > 0) {
            foto_int = await convertirImagenes(archivos);
        }

        const Entrada = obtenerFechaHoraLocal();

        console.log('Enviando datos al servidor:', {
            Marca, Modelo, Año, Numero_chasis,
            id_client, id_trabajo,
            tieneFotos: foto_int.length > 0
        });

        const response = await fetch(API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                Marca, Modelo, Año, Numero_chasis,
                Entrada, id_client, id_trabajo, 
                foto_int: JSON.stringify(foto_int)
            })
        });

        const responseData = await response.json();
        console.log('Respuesta del servidor:', responseData);

        if (response.ok) {
            limpiarFormulario();
            mostrarError('', true);
            cargarVehiculos();
            alert('Vehículo registrado exitosamente. ' + 
                  (foto_int.length > 0 ? 'Fotos guardadas correctamente.' : ''));
        } else {
            mostrarError(responseData.error || 'Error al registrar vehículo');
        }
    } catch (error) {
        console.error('Error al registrar vehículo:', error);
        mostrarError('Error al registrar vehículo: ' + error.message);
    }
}

// ==============================
// CARGAR TABLA CON CLICK PARA VER DETALLE
// ==============================
async function cargarVehiculos() {
    try {
        const res = await fetch(API);
        const data = await res.json();

        const tbody = document.getElementById("tabla-veh");
        tbody.innerHTML = "";

        data.forEach(v => {
            const fila = document.createElement('tr');
            fila.style.cursor = 'pointer';
            fila.onclick = () => verDetalleVehiculo(v.id_Vehic);
            
            fila.innerHTML = `
                <td>${v.id_Vehic}</td>
                <td>${v.Marca} ${v.Modelo} ${v.Año ? `(${v.Año})` : ''}</td>
                <td>${v.Numero_chasis}</td>
                <td>${v.pr_name ? `${v.pr_name} ${v.sc_name || ''} ${v.pr_lastname || ''}` : 'N/A'}</td>
                <td>${v.Name_trabajo || "N/A"}</td>
                <td>${formatearFechaLocal(v.Entrada)}</td>
                <td>${v.Salida ? formatearFechaLocal(v.Salida) : "Pendiente"}</td>
                <td onclick="event.stopPropagation()">
                    <button class="btn-salida" onclick="registrarSalida(${v.id_Vehic})" ${v.Salida ? "disabled" : ""}>
                        <i class="fas fa-sign-out-alt"></i> Salida
                    </button>
                    <button class="btn-eliminar" onclick="eliminarVehiculo(${v.id_Vehic})">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(fila);
        });
    } catch (error) {
        console.error('Error cargando vehículos:', error);
    }
}

// ==============================
// VER DETALLE DEL VEHÍCULO (MODAL) CON EDICIÓN
// ==============================
async function verDetalleVehiculo(id) {
    try {
        const res = await fetch(`${API}/${id}`);
        const vehiculo = await res.json();
        
        vehiculoEditando = vehiculo;
        modoEdicion = false;
        
        let fotosEntrada = [];
        let fotosSalida = [];
        
        // Procesar fotos de entrada
        if (vehiculo.foto_int) {
            if (typeof vehiculo.foto_int === 'string') {
                try {
                    fotosEntrada = JSON.parse(vehiculo.foto_int);
                } catch (e) {
                    fotosEntrada = [vehiculo.foto_int];
                }
            } else if (Array.isArray(vehiculo.foto_int)) {
                fotosEntrada = vehiculo.foto_int;
            }
        }
        
        // Procesar fotos de salida
        if (vehiculo.foto_out) {
            if (typeof vehiculo.foto_out === 'string') {
                try {
                    fotosSalida = JSON.parse(vehiculo.foto_out);
                } catch (e) {
                    fotosSalida = [vehiculo.foto_out];
                }
            } else if (Array.isArray(vehiculo.foto_out)) {
                fotosSalida = vehiculo.foto_out;
            }
        }
        
        const modal = document.getElementById('modal-vehiculo');
        const contenido = document.getElementById('modal-contenido');
        
        contenido.innerHTML = `
            <div class="detalle-vehiculo">
                <h2>Detalle del Vehículo <span id="estado-edicion" style="font-size: 14px; color: #666;"></span></h2>
                
                <div class="detalle-grid" id="detalle-grid">
                    <!-- Los datos se cargarán dinámicamente -->
                </div>
                
                <h3>Imágenes de Entrada</h3>
                <div class="galeria-imagenes" id="galeria-entrada">
                    ${fotosEntrada.length > 0 ? 
                        fotosEntrada.map((foto, index) => 
                            `<img src="${foto}" alt="Imagen Entrada ${index + 1}" class="imagen-detalle">`
                        ).join('') : 
                        '<p>No hay imágenes de entrada</p>'
                    }
                </div>
                
                ${vehiculo.Salida ? `
                <h3>Imágenes de Salida</h3>
                <div class="galeria-imagenes" id="galeria-salida">
                    ${fotosSalida.length > 0 ? 
                        fotosSalida.map((foto, index) => 
                            `<img src="${foto}" alt="Imagen Salida ${index + 1}" class="imagen-detalle">`
                        ).join('') : 
                        '<p>No hay imágenes de salida</p>'
                    }
                </div>
                ` : ''}
                
                <div class="botones-modal">
                    <button class="btn-editar" id="btn-editar-modal" onclick="activarEdicionModal()">
                        <i class="fas fa-edit"></i> Editar Vehículo
                    </button>
                    <button class="btn-guardar" id="btn-guardar-modal" style="display: none;" onclick="guardarEdicionModal()">
                        <i class="fas fa-save"></i> Guardar Cambios
                    </button>
                    <button class="btn-cancelar" id="btn-cancelar-modal" style="display: none;" onclick="cancelarEdicionModal()">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                    <button class="btn-cerrar" onclick="cerrarModal()">
                        Cerrar
                    </button>
                </div>
            </div>
        `;
        
        // Cargar los datos en el grid
        cargarDatosEnModal(vehiculo);
        
        modal.style.display = 'block';
    } catch (error) {
        console.error('Error cargando detalle:', error);
        mostrarError('Error al cargar los detalles del vehículo');
    }
}

// ==============================
// CARGAR DATOS EN EL MODAL (con funcionalidad de edición)
// ==============================
async function cargarDatosEnModal(vehiculo) {
    const detalleGrid = document.getElementById('detalle-grid');
    
    // Obtener listas actualizadas para los selects
    let clientesHTML = '<option value="">Seleccione cliente</option>';
    let trabajosHTML = '<option value="">Seleccione trabajo</option>';
    
    try {
        const [resClientes, resTrabajos] = await Promise.all([
            fetch("http://localhost:3000/clientes"),
            fetch("http://localhost:3000/trabajos")
        ]);
        
        const clientes = await resClientes.json();
        const trabajos = await resTrabajos.json();
        
        clientes.forEach(c => {
            const selected = vehiculo.id_client == c.id_client ? 'selected' : '';
            clientesHTML += `<option value="${c.id_client}" ${selected}>${c.pr_name} ${c.sc_name || ''} ${c.pr_lastname || ''} ${c.sc_lastname || ''}</option>`;
        });
        
        trabajos.forEach(t => {
            const selected = vehiculo.id_trabajo == t.id_trabajo ? 'selected' : '';
            trabajosHTML += `<option value="${t.id_trabajo}" ${selected}>${t.Name_trabajo}</option>`;
        });
    } catch (error) {
        console.error('Error cargando listas para edición:', error);
    }
    
    detalleGrid.innerHTML = `
        <div class="detalle-item">
            <label>ID:</label>
            <div class="valor" id="valor-id">${vehiculo.id_Vehic}</div>
        </div>
        
        <div class="detalle-item">
            <label>Marca:</label>
            <div class="valor" id="valor-marca">${vehiculo.Marca || ''}</div>
            <input type="text" id="input-marca" class="input-edicion" style="display: none;" 
                   value="${vehiculo.Marca || ''}" maxlength="50">
        </div>
        
        <div class="detalle-item">
            <label>Modelo:</label>
            <div class="valor" id="valor-modelo">${vehiculo.Modelo || ''}</div>
            <input type="text" id="input-modelo" class="input-edicion" style="display: none;" 
                   value="${vehiculo.Modelo || ''}" maxlength="50">
        </div>
        
        <div class="detalle-item">
            <label>Año:</label>
            <div class="valor" id="valor-anio">${vehiculo.Año || ''}</div>
            <input type="text" id="input-anio" class="input-edicion" style="display: none;" 
                   value="${vehiculo.Año || ''}" pattern="\\d{4}" maxlength="4">
        </div>
        
        <div class="detalle-item">
            <label>Número de Chasis:</label>
            <div class="valor" id="valor-chasis">${vehiculo.Numero_chasis || ''}</div>
            <input type="text" id="input-chasis" class="input-edicion" style="display: none;" 
                   value="${vehiculo.Numero_chasis || ''}" maxlength="16">
        </div>
        
        <div class="detalle-item">
            <label>Cliente:</label>
            <div class="valor" id="valor-cliente">${vehiculo.pr_name || ''} ${vehiculo.pr_lastname || ''}</div>
            <select id="select-cliente" class="select-edicion" style="display: none;">
                ${clientesHTML}
            </select>
        </div>
        
        <div class="detalle-item">
            <label>Trabajo:</label>
            <div class="valor" id="valor-trabajo">${vehiculo.Name_trabajo || ''}</div>
            <select id="select-trabajo" class="select-edicion" style="display: none;">
                ${trabajosHTML}
            </select>
        </div>
        
        <div class="detalle-item">
            <label>Fecha de Entrada:</label>
            <div class="valor">${formatearFechaLocal(vehiculo.Entrada)}</div>
        </div>
        
        <div class="detalle-item">
            <label>Fecha de Salida:</label>
            <div class="valor">${vehiculo.Salida ? formatearFechaLocal(vehiculo.Salida) : 'Pendiente'}</div>
        </div>
    `;
    
    // Agregar evento para limitar chasis en modo edición
    const inputChasis = document.getElementById('input-chasis');
    if (inputChasis) {
        inputChasis.addEventListener('input', function() {
            if (this.value.length > 16) {
                this.value = this.value.substring(0, 16);
            }
        });
    }
}

// ==============================
// ACTIVAR MODO EDICIÓN EN MODAL
// ==============================
function activarEdicionModal() {
    modoEdicion = true;
    
    // Cambiar estado
    document.getElementById('estado-edicion').textContent = '(Modo Edición)';
    document.getElementById('estado-edicion').style.color = '#ff9800';
    
    // Ocultar botón editar, mostrar guardar y cancelar
    document.getElementById('btn-editar-modal').style.display = 'none';
    document.getElementById('btn-guardar-modal').style.display = 'inline-flex';
    document.getElementById('btn-cancelar-modal').style.display = 'inline-flex';
    
    // Ocultar valores, mostrar inputs
    document.querySelectorAll('.valor').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.input-edicion').forEach(el => el.style.display = 'block');
    document.querySelectorAll('.select-edicion').forEach(el => el.style.display = 'block');
}

// ==============================
// CANCELAR EDICIÓN EN MODAL
// ==============================
function cancelarEdicionModal() {
    modoEdicion = false;
    
    // Restaurar estado
    document.getElementById('estado-edicion').textContent = '';
    
    // Restaurar botones
    document.getElementById('btn-editar-modal').style.display = 'inline-flex';
    document.getElementById('btn-guardar-modal').style.display = 'none';
    document.getElementById('btn-cancelar-modal').style.display = 'none';
    
    // Restaurar valores
    document.querySelectorAll('.valor').forEach(el => el.style.display = 'block');
    document.querySelectorAll('.input-edicion').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.select-edicion').forEach(el => el.style.display = 'none');
}

// ==============================
// GUARDAR CAMBIOS EN MODAL
// ==============================
async function guardarEdicionModal() {
    try {
        if (!vehiculoEditando) {
            mostrarErrorModal('No hay vehículo para editar');
            return;
        }
        
        // Obtener valores de los inputs
        const Marca = document.getElementById('input-marca').value.trim();
        const Modelo = document.getElementById('input-modelo').value.trim();
        const Año = document.getElementById('input-anio').value.trim();
        const Numero_chasis = document.getElementById('input-chasis').value.trim();
        const id_client = document.getElementById('select-cliente').value;
        const id_trabajo = document.getElementById('select-trabajo').value;
        
        // Validaciones
        if (!Marca || !Modelo || !Numero_chasis || !id_client || !id_trabajo) {
            mostrarErrorModal('Por favor complete todos los campos obligatorios');
            return;
        }
        
        if (Numero_chasis.length > 16) {
            mostrarErrorModal('El número de chasis no puede exceder 16 caracteres');
            return;
        }
        
        if (Año && (Año.length !== 4 || isNaN(Año))) {
            mostrarErrorModal('El año debe ser un número de 4 dígitos');
            return;
        }
        
        // Mostrar loading
        document.getElementById('btn-guardar-modal').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        document.getElementById('btn-guardar-modal').disabled = true;
        
        console.log('Enviando actualización para vehículo ID:', vehiculoEditando.id_Vehic, {
            Marca, Modelo, Año, Numero_chasis, id_client, id_trabajo
        });
        
        const response = await fetch(`${API}/${vehiculoEditando.id_Vehic}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                Marca, Modelo, Año, Numero_chasis,
                id_client, id_trabajo
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert('Vehículo actualizado exitosamente');
            
            // Actualizar los valores en pantalla
            document.getElementById('valor-marca').textContent = Marca;
            document.getElementById('valor-modelo').textContent = Modelo;
            document.getElementById('valor-anio').textContent = Año;
            document.getElementById('valor-chasis').textContent = Numero_chasis;
            
            // Actualizar cliente y trabajo (necesitaríamos recargar estos datos)
            // Por ahora, cerramos el modo edición
            cancelarEdicionModal();
            
            // Recargar la tabla principal
            cargarVehiculos();
            
        } else {
            throw new Error(result.error || 'Error al actualizar vehículo');
        }
        
    } catch (error) {
        console.error('Error guardando cambios:', error);
        mostrarErrorModal('Error al guardar cambios: ' + error.message);
    } finally {
        // Restaurar botón
        if (document.getElementById('btn-guardar-modal')) {
            document.getElementById('btn-guardar-modal').innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
            document.getElementById('btn-guardar-modal').disabled = false;
        }
    }
}

// ==============================
// REGISTRAR SALIDA
// ==============================
async function registrarSalida(id) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.click();

    input.onchange = async () => {
        const files = input.files;
        if (files.length === 0) return;
        
        try {
            // Convertir imágenes de salida
            const foto_out = await convertirImagenes(files);
            
            const Salida = obtenerFechaHoraLocal();
            console.log('Registrando salida para vehículo ID:', id, 'con', foto_out.length, 'fotos');

            const response = await fetch(`${API}/salida/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    Salida, 
                    foto_out: JSON.stringify(foto_out) 
                })
            });

            const result = await response.json();
            console.log('Respuesta de salida:', result);

            if (response.ok) {
                cargarVehiculos();
                alert('Salida registrada exitosamente. ' + 
                      (foto_out.length > 0 ? 'Fotos guardadas correctamente.' : ''));
            } else {
                mostrarError(result.error || 'Error al registrar salida');
            }
        } catch (error) {
            console.error('Error al registrar salida:', error);
            mostrarError('Error al registrar salida: ' + error.message);
        }
    };
}

// ==============================
// FUNCIONES AUXILIARES
// ==============================
function mostrarError(mensaje, esExito = false) {
    const elemento = document.getElementById('mensaje-error');
    if (elemento) {
        elemento.textContent = mensaje;
        elemento.className = esExito ? 'mensaje-exito' : 'mensaje-error';
        
        if (esExito) {
            setTimeout(() => {
                elemento.textContent = '';
                elemento.className = '';
            }, 3000);
        }
    }
}

function mostrarErrorModal(mensaje) {
    alert(mensaje);
}

function limpiarFormulario() {
    document.getElementById("Marca").value = '';
    document.getElementById("Modelo").value = '';
    document.getElementById("Año").value = '';
    document.getElementById("Numero_chasis").value = '';
    document.getElementById("id_client").selectedIndex = 0;
    document.getElementById("id_trabajo").selectedIndex = 0;
    document.getElementById("foto_int").value = '';
    document.getElementById("preview-container").innerHTML = '';
}

function cerrarModal() {
    document.getElementById('modal-vehiculo').style.display = 'none';
    vehiculoEditando = null;
    modoEdicion = false;
}

function eliminarVehiculo(id) {
    if (!confirm("¿Está seguro de eliminar este vehículo? Esta acción no se puede deshacer.")) return;
    
    fetch(`${API}/${id}`, { method: "DELETE" })
        .then(response => {
            if (response.ok) {
                cargarVehiculos();
                cerrarModal();
                alert('Vehículo eliminado exitosamente');
            } else {
                return response.json().then(error => {
                    throw new Error(error.error || 'Error al eliminar vehículo');
                });
            }
        })
        .catch(error => {
            console.error('Error eliminando vehículo:', error);
            mostrarError(error.message);
        });
}

function filtrarTabla() {
    const texto = document.getElementById("buscar").value.toLowerCase();
    document.querySelectorAll("#tabla-veh tr").forEach(fila => {
        const textoFila = fila.innerText.toLowerCase();
        fila.style.display = textoFila.includes(texto) ? "" : "none";
    });
}