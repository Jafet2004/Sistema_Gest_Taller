const API = "http://localhost:3000/vehiculos";
let modoEdicion = false;
let vehiculoId = null;
let datosOriginales = {};
let nuevasImagenes = [];

// ==============================
// INICIALIZACIÓN
// ==============================
document.addEventListener('DOMContentLoaded', function() {
    console.log('View_car.js cargado - Modo búsqueda por chasis');
    
    // Configurar eventos
    document.getElementById('btn-buscar').addEventListener('click', buscarPorChasis);
    document.getElementById('input-chasis').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            buscarPorChasis();
        }
    });
    
    // Limitar chasis a 16 caracteres en input de búsqueda
    document.getElementById('input-chasis').addEventListener('input', function() {
        if (this.value.length > 16) {
            this.value = this.value.substring(0, 16);
        }
    });
    
    // Configurar eventos de edición (inicialmente deshabilitados)
    document.getElementById('btn-editar').addEventListener('click', activarModoEdicion);
    document.getElementById('btn-guardar').addEventListener('click', guardarCambios);
    document.getElementById('btn-cancelar').addEventListener('click', cancelarEdicion);
    document.getElementById('nuevasImagenes').addEventListener('change', previewNuevasImagenes);
    
    // Limitar chasis a 16 caracteres en modo edición
    const chasisInput = document.getElementById('Numero_chasis_input');
    if (chasisInput) {
        chasisInput.addEventListener('input', function() {
            if (this.value.length > 16) {
                this.value = this.value.substring(0, 16);
            }
        });
    }
});

// ==============================
// BUSCAR VEHÍCULO POR CHASIS
// ==============================
async function buscarPorChasis() {
    const chasis = document.getElementById('input-chasis').value.trim();
    
    if (!chasis) {
        mostrarMensajeBusqueda('Por favor ingrese un número de chasis', 'error');
        return;
    }
    
    if (chasis.length > 16) {
        mostrarMensajeBusqueda('El número de chasis no puede exceder 16 caracteres', 'error');
        return;
    }
    
    mostrarMensajeBusqueda('Buscando vehículo...', 'info');
    
    try {
        // Primero obtener todos los vehículos
        const response = await fetch(API);
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const vehiculos = await response.json();
        
        // Buscar el vehículo por número de chasis
        const vehiculo = vehiculos.find(v => 
            v.Numero_chasis && v.Numero_chasis.trim() === chasis
        );
        
        if (!vehiculo) {
            mostrarMensajeBusqueda(`No se encontró ningún vehículo con el chasis: ${chasis}`, 'error');
            ocultarDetalles();
            return;
        }
        
        console.log('Vehículo encontrado:', vehiculo);
        
        // Guardar datos
        vehiculoId = vehiculo.id_Vehic;
        datosOriginales = { ...vehiculo };
        
        // Mostrar detalles
        mostrarDetallesVehiculo();
        
        // Actualizar interfaz
        actualizarInterfaz(vehiculo);
        
        // Cargar imágenes
        cargarImagenes(vehiculo);
        
        // Actualizar historial
        actualizarHistorial(vehiculo);
        
        // Cargar listas para edición
        cargarClientesYtrabajos();
        
        mostrarMensajeBusqueda('Vehículo encontrado', 'exito');
        
    } catch (error) {
        console.error('Error buscando vehículo:', error);
        mostrarMensajeBusqueda('Error al buscar el vehículo: ' + error.message, 'error');
        ocultarDetalles();
    }
}

// ==============================
// MOSTRAR/OCULTAR DETALLES
// ==============================
function mostrarDetallesVehiculo() {
    document.getElementById('detalles-vehiculo').style.display = 'block';
    document.querySelector('h1').innerHTML = '<i class="fas fa-car"></i> Detalle del Vehículo';
    
    // Habilitar botón de edición
    document.getElementById('btn-editar').disabled = false;
}

function ocultarDetalles() {
    document.getElementById('detalles-vehiculo').style.display = 'none';
    document.querySelector('h1').innerHTML = '<i class="fas fa-car"></i> Buscar Vehículo por Chasis';
    
    // Deshabilitar botón de edición
    document.getElementById('btn-editar').disabled = true;
}

// ==============================
// CARGAR DATOS DEL VEHÍCULO
// ==============================
async function cargarDatosVehiculo() {
    try {
        if (!vehiculoId) {
            throw new Error('No hay ID de vehículo');
        }
        
        console.log('Cargando datos para vehículo ID:', vehiculoId);
        
        const response = await fetch(`${API}/${vehiculoId}`);
        console.log('Respuesta del servidor:', response.status);
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const vehiculo = await response.json();
        console.log('Datos del vehículo recibidos:', vehiculo);
        
        // Verificar estructura de datos
        if (!vehiculo || Object.keys(vehiculo).length === 0) {
            throw new Error('El vehículo no existe o no se encontró');
        }
        
        // Guardar datos originales
        datosOriginales = { ...vehiculo };
        
        // Actualizar interfaz
        actualizarInterfaz(vehiculo);
        
        // Cargar imágenes
        cargarImagenes(vehiculo);
        
        // Actualizar historial
        actualizarHistorial(vehiculo);
        
        mostrarMensaje('Datos actualizados', 'exito');
        
    } catch (error) {
        console.error('Error cargando datos:', error);
        mostrarMensaje('Error al cargar los datos: ' + error.message, 'error');
    }
}

// ==============================
// ACTUALIZAR INTERFAZ CON DATOS
// ==============================
function actualizarInterfaz(vehiculo) {
    console.log('Actualizando interfaz con:', vehiculo);
    
    // Información básica
    document.getElementById('id_Vehic').textContent = vehiculo.id_Vehic || '-';
    document.getElementById('Marca').textContent = vehiculo.Marca || '-';
    document.getElementById('Modelo').textContent = vehiculo.Modelo || '-';
    document.getElementById('Año').textContent = vehiculo.Año || '-';
    document.getElementById('Numero_chasis').textContent = vehiculo.Numero_chasis || '-';
    
    // Cliente
    let nombreCliente = '-';
    if (vehiculo.pr_name && vehiculo.pr_lastname) {
        nombreCliente = `${vehiculo.pr_name} ${vehiculo.pr_lastname}`;
    } else if (vehiculo.pr_name) {
        nombreCliente = vehiculo.pr_name;
    }
    document.getElementById('Cliente').textContent = nombreCliente;
    
    // Trabajo
    document.getElementById('Trabajo').textContent = vehiculo.Name_trabajo || '-';
    
    // Fechas
    document.getElementById('Entrada').textContent = formatearFecha(vehiculo.Entrada);
    document.getElementById('Salida').textContent = vehiculo.Salida ? 
        formatearFecha(vehiculo.Salida) : 'Pendiente';
    
    // Rellenar inputs para modo edición
    document.getElementById('Marca_input').value = vehiculo.Marca || '';
    document.getElementById('Modelo_input').value = vehiculo.Modelo || '';
    document.getElementById('Año_input').value = vehiculo.Año || '';
    document.getElementById('Numero_chasis_input').value = vehiculo.Numero_chasis || '';
    
    // Actualizar título de la página
    document.title = `${vehiculo.Marca || 'Vehículo'} ${vehiculo.Modelo || ''} - Detalles`;
}

// ==============================
// CARGAR CLIENTES Y TRABAJOS PARA SELECTS
// ==============================
async function cargarClientesYtrabajos() {
    try {
        console.log('Cargando listas de clientes y trabajos...');
        
        // Cargar clientes
        const resClientes = await fetch("http://localhost:3000/clientes");
        if (!resClientes.ok) throw new Error('Error cargando clientes');
        const clientes = await resClientes.json();
        
        const selectCliente = document.getElementById('id_client_select');
        selectCliente.innerHTML = '<option value="">Seleccione un cliente</option>';
        clientes.forEach(c => {
            const nombreCompleto = `${c.pr_name || ''} ${c.sc_name || ''} ${c.pr_lastname || ''} ${c.sc_lastname || ''}`.trim();
            selectCliente.innerHTML += `<option value="${c.id_client}">${nombreCompleto || `Cliente ${c.id_client}`}</option>`;
        });
        
        // Cargar trabajos
        const resTrabajos = await fetch("http://localhost:3000/trabajos");
        if (!resTrabajos.ok) throw new Error('Error cargando trabajos');
        const trabajos = await resTrabajos.json();
        
        const selectTrabajo = document.getElementById('id_trabajo_select');
        selectTrabajo.innerHTML = '<option value="">Seleccione un trabajo</option>';
        trabajos.forEach(t => {
            selectTrabajo.innerHTML += `<option value="${t.id_trabajo}">${t.Name_trabajo || t.nombre || `Trabajo ${t.id_trabajo}`}</option>`;
        });
        
        console.log('Listas cargadas correctamente');
        
        // Seleccionar valores actuales después de cargar
        setTimeout(() => {
            if (datosOriginales.id_client) {
                selectCliente.value = datosOriginales.id_client;
                console.log('Cliente seleccionado:', datosOriginales.id_client);
            }
            if (datosOriginales.id_trabajo) {
                selectTrabajo.value = datosOriginales.id_trabajo;
                console.log('Trabajo seleccionado:', datosOriginales.id_trabajo);
            }
        }, 500);
        
    } catch (error) {
        console.error('Error cargando listas:', error);
        mostrarMensaje('Error al cargar listas de clientes y trabajos', 'error');
    }
}

// ==============================
// CARGAR IMÁGENES
// ==============================
function cargarImagenes(vehiculo) {
    const galeria = document.getElementById('galeria-imagenes');
    galeria.innerHTML = '';
    
    console.log('Procesando imágenes del vehículo:', vehiculo);
    
    try {
        let fotosEntrada = [];
        let fotosSalida = [];
        
        // Intentar cargar imágenes de entrada
        if (vehiculo.fotos_int) {
            if (typeof vehiculo.fotos_int === 'string') {
                try {
                    fotosEntrada = JSON.parse(vehiculo.fotos_int);
                } catch (e) {
                    console.log('Error parseando fotos_int como JSON, usando como string directo');
                    fotosEntrada = [vehiculo.fotos_int];
                }
            } else if (Array.isArray(vehiculo.fotos_int)) {
                fotosEntrada = vehiculo.fotos_int;
            }
        } else if (vehiculo.foto_int) {
            // Compatibilidad con versión antigua
            fotosEntrada = [vehiculo.foto_int];
        }
        
        // Intentar cargar imágenes de salida
        if (vehiculo.fotos_out) {
            if (typeof vehiculo.fotos_out === 'string') {
                try {
                    fotosSalida = JSON.parse(vehiculo.fotos_out);
                } catch (e) {
                    console.log('Error parseando fotos_out como JSON');
                    fotosSalida = [vehiculo.fotos_out];
                }
            } else if (Array.isArray(vehiculo.fotos_out)) {
                fotosSalida = vehiculo.fotos_out;
            }
        } else if (vehiculo.foto_out) {
            // Compatibilidad con versión antigua
            fotosSalida = [vehiculo.foto_out];
        }
        
        console.log('Fotos entrada:', fotosEntrada.length);
        console.log('Fotos salida:', fotosSalida.length);
        
        // Mostrar imágenes de entrada
        fotosEntrada.forEach((foto, index) => {
            if (foto && typeof foto === 'string' && foto.startsWith('data:image')) {
                const imagenItem = crearItemImagen(foto, 'Entrada', index + 1);
                galeria.appendChild(imagenItem);
            }
        });
        
        // Mostrar imágenes de salida
        fotosSalida.forEach((foto, index) => {
            if (foto && typeof foto === 'string' && foto.startsWith('data:image')) {
                const imagenItem = crearItemImagen(foto, 'Salida', index + 1);
                galeria.appendChild(imagenItem);
            }
        });
        
        // Si no hay imágenes
        if (galeria.children.length === 0) {
            galeria.innerHTML = `
                <div style="grid-column: span 3; text-align: center; padding: 2rem;">
                    <i class="fas fa-image" style="font-size: 3rem; color: #ccc; margin-bottom: 1rem;"></i>
                    <p>No hay imágenes registradas para este vehículo</p>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('Error procesando imágenes:', error);
        galeria.innerHTML = `
            <div style="grid-column: span 3; text-align: center; padding: 2rem; color: #f44336;">
                <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                <p>Error al procesar las imágenes</p>
            </div>
        `;
    }
}

// ==============================
// FUNCIONES PARA IMÁGENES (se mantienen igual)
// ==============================
function crearItemImagen(src, tipo, numero) {
    const div = document.createElement('div');
    div.className = 'imagen-item';
    
    div.innerHTML = `
        <img src="${src}" alt="Imagen ${tipo} ${numero}" onclick="ampliarImagen('${src}')">
        <div class="imagen-tipo">${tipo} #${numero}</div>
    `;
    
    return div;
}

function ampliarImagen(src) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.9);
        z-index: 1000;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
    `;
    
    const img = document.createElement('img');
    img.src = src;
    img.style.cssText = `
        max-width: 90%;
        max-height: 90%;
        object-fit: contain;
        border-radius: 8px;
    `;
    
    // Botón para cerrar
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
        position: absolute;
        top: 20px;
        right: 20px;
        background: #b71c1c;
        color: white;
        border: none;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        font-size: 24px;
        cursor: pointer;
        z-index: 1001;
    `;
    
    overlay.appendChild(img);
    overlay.appendChild(closeBtn);
    
    closeBtn.onclick = () => document.body.removeChild(overlay);
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            document.body.removeChild(overlay);
        }
    };
    
    document.body.appendChild(overlay);
}

// ==============================
// FUNCIONES DE EDICIÓN (se mantienen igual con pequeñas modificaciones)
// ==============================
function activarModoEdicion() {
    console.log('Activando modo edición');
    
    if (!datosOriginales || Object.keys(datosOriginales).length === 0) {
        mostrarMensaje('No hay datos del vehículo para editar', 'error');
        return;
    }
    
    modoEdicion = true;
    
    // Cambiar botones
    document.getElementById('btn-editar').style.display = 'none';
    document.getElementById('btn-guardar').style.display = 'flex';
    document.getElementById('btn-cancelar').style.display = 'flex';
    
    // Activar modo edición en el contenedor
    document.getElementById('info-vehiculo').classList.add('modo-edicion');
    document.getElementById('info-vehiculo').classList.remove('modo-lectura');
    
    // Mostrar sección para agregar imágenes
    document.getElementById('agregar-imagenes').style.display = 'block';
    
    // Cambiar título
    document.querySelector('h1').innerHTML = '<i class="fas fa-car"></i> Editando Vehículo';
}

function cancelarEdicion() {
    console.log('Cancelando edición');
    
    modoEdicion = false;
    
    // Restaurar botones
    document.getElementById('btn-editar').style.display = 'flex';
    document.getElementById('btn-guardar').style.display = 'none';
    document.getElementById('btn-cancelar').style.display = 'none';
    
    // Desactivar modo edición
    document.getElementById('info-vehiculo').classList.remove('modo-edicion');
    document.getElementById('info-vehiculo').classList.add('modo-lectura');
    
    // Ocultar sección de nuevas imágenes
    document.getElementById('agregar-imagenes').style.display = 'none';
    
    // Limpiar preview de nuevas imágenes
    document.getElementById('nuevas-imagenes-preview').innerHTML = '';
    nuevasImagenes = [];
    
    // Restaurar valores originales de los inputs
    if (datosOriginales) {
        document.getElementById('Marca_input').value = datosOriginales.Marca || '';
        document.getElementById('Modelo_input').value = datosOriginales.Modelo || '';
        document.getElementById('Año_input').value = datosOriginales.Año || '';
        document.getElementById('Numero_chasis_input').value = datosOriginales.Numero_chasis || '';
        
        if (datosOriginales.id_client) {
            document.getElementById('id_client_select').value = datosOriginales.id_client;
        }
        if (datosOriginales.id_trabajo) {
            document.getElementById('id_trabajo_select').value = datosOriginales.id_trabajo;
        }
    }
    
    // Restaurar título
    document.querySelector('h1').innerHTML = '<i class="fas fa-car"></i> Detalle del Vehículo';
}

function previewNuevasImagenes(event) {
    const files = event.target.files;
    const previewContainer = document.getElementById('nuevas-imagenes-preview');
    const tipo = document.getElementById('tipoImagen').value;
    
    console.log(`Agregando ${files.length} nuevas imágenes de tipo: ${tipo}`);
    
    // Limitar a 5 imágenes nuevas
    if (nuevasImagenes.length + files.length > 5) {
        mostrarMensaje('Máximo 5 nuevas imágenes permitidas', 'error');
        event.target.value = '';
        return;
    }
    
    for (let file of files) {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const previewDiv = document.createElement('div');
            previewDiv.className = 'preview-nueva';
            
            previewDiv.innerHTML = `
                <img src="${e.target.result}" alt="Nueva imagen">
                <div class="remove-preview" onclick="eliminarPreview(this)">×</div>
                <input type="hidden" value="${e.target.result}" data-tipo="${tipo}">
            `;
            
            previewContainer.appendChild(previewDiv);
            
            // Agregar a array de nuevas imágenes
            nuevasImagenes.push({
                data: e.target.result,
                tipo: tipo,
                nombre: file.name,
                tamaño: file.size
            });
            
            console.log(`Imagen agregada: ${file.name}, tipo: ${tipo}`);
        };
        
        reader.onerror = function(error) {
            console.error('Error leyendo archivo:', error);
            mostrarMensaje(`Error al leer el archivo: ${file.name}`, 'error');
        };
        
        reader.readAsDataURL(file);
    }
    
    event.target.value = '';
}

function eliminarPreview(element) {
    const previewDiv = element.parentElement;
    const dataUrl = previewDiv.querySelector('input[type="hidden"]').value;
    const tipo = previewDiv.querySelector('input[type="hidden"]').dataset.tipo;
    
    // Eliminar del array de nuevas imágenes
    const index = nuevasImagenes.findIndex(img => 
        img.data === dataUrl && img.tipo === tipo
    );
    
    if (index !== -1) {
        nuevasImagenes.splice(index, 1);
        console.log(`Imagen eliminada del preview, quedan: ${nuevasImagenes.length}`);
    }
    
    previewDiv.remove();
}

async function guardarCambios() {
    try {
        console.log('Iniciando guardado de cambios...');
        
        // Validar chasis
        const chasis = document.getElementById('Numero_chasis_input').value;
        if (chasis.length > 16) {
            mostrarMensaje('El número de chasis no puede exceder 16 caracteres', 'error');
            return;
        }
        
        // Recolectar datos del formulario
        const datosActualizados = {
            Marca: document.getElementById('Marca_input').value.trim(),
            Modelo: document.getElementById('Modelo_input').value.trim(),
            Año: document.getElementById('Año_input').value.trim(),
            Numero_chasis: chasis.trim(),
            id_client: document.getElementById('id_client_select').value,
            id_trabajo: document.getElementById('id_trabajo_select').value,
            nuevasImagenes: nuevasImagenes
        };
        
        console.log('Datos a actualizar:', datosActualizados);
        
        // Validar campos obligatorios
        if (!datosActualizados.Marca || !datosActualizados.Modelo || 
            !datosActualizados.Numero_chasis || !datosActualizados.id_client || 
            !datosActualizados.id_trabajo) {
            mostrarMensaje('Por favor complete todos los campos obligatorios (*)', 'error');
            return;
        }
        
        // Mostrar carga
        mostrarMensaje('Guardando cambios...', 'info');
        
        // Enviar actualización al servidor
        console.log(`Enviando PUT a ${API}/editar/${vehiculoId}`);
        const response = await fetch(`${API}/editar/${vehiculoId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(datosActualizados)
        });
        
        console.log('Respuesta del servidor:', response.status, response.statusText);
        
        if (response.ok) {
            const result = await response.json();
            console.log('Resultado:', result);
            
            // Recargar datos
            await cargarDatosVehiculo();
            
            // Salir del modo edición
            cancelarEdicion();
            
            // Mostrar éxito
            mostrarMensaje('Cambios guardados exitosamente', 'exito');
            
            // Agregar al historial
            agregarAlHistorial('Edición', 'Se actualizó la información del vehículo');
            
        } else {
            const errorText = await response.text();
            console.error('Error del servidor:', errorText);
            throw new Error(`Error ${response.status}: ${errorText}`);
        }
        
    } catch (error) {
        console.error('Error guardando cambios:', error);
        mostrarMensaje('Error al guardar los cambios: ' + error.message, 'error');
    }
}

// ==============================
// HISTORIAL
// ==============================
function actualizarHistorial(vehiculo) {
    // Actualizar fechas en historial
    document.getElementById('fecha-entrada-h').textContent = formatearFecha(vehiculo.Entrada);
    
    if (vehiculo.Salida) {
        document.getElementById('fecha-salida-h').textContent = formatearFecha(vehiculo.Salida);
        document.getElementById('historial-salida').style.display = 'block';
    } else {
        document.getElementById('historial-salida').style.display = 'none';
    }
}

function agregarAlHistorial(titulo, descripcion) {
    const historialDiv = document.getElementById('historial-cambios');
    const ahora = new Date();
    
    const item = document.createElement('div');
    item.className = 'historial-item';
    item.innerHTML = `
        <h4>${titulo}</h4>
        <p><strong>Fecha:</strong> ${formatearFecha(ahora.toISOString())}</p>
        <p><strong>Descripción:</strong> ${descripcion}</p>
    `;
    
    historialDiv.insertBefore(item, historialDiv.firstChild);
}

// ==============================
// FUNCIONES AUXILIARES
// ==============================
function formatearFecha(fechaString) {
    if (!fechaString) return 'N/A';
    
    try {
        const fecha = new Date(fechaString);
        if (isNaN(fecha.getTime())) {
            return fechaString;
        }
        
        return fecha.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        console.error('Error formateando fecha:', error, fechaString);
        return fechaString;
    }
}

function mostrarMensajeBusqueda(mensaje, tipo = 'info') {
    const elemento = document.getElementById('mensaje-busqueda');
    if (elemento) {
        elemento.textContent = mensaje;
        elemento.className = `mensaje mensaje-${tipo}`;
        elemento.style.display = 'block';
        
        if (tipo === 'exito' || tipo === 'error') {
            setTimeout(() => {
                elemento.style.display = 'none';
            }, 5000);
        }
    }
}

function mostrarMensaje(mensaje, tipo = 'info') {
    const elemento = document.getElementById('mensaje');
    if (elemento) {
        elemento.textContent = mensaje;
        elemento.className = `mensaje mensaje-${tipo}`;
        elemento.style.display = 'block';
        
        if (tipo === 'exito' || tipo === 'error') {
            setTimeout(() => {
                elemento.style.display = 'none';
            }, 5000);
        }
    }
}