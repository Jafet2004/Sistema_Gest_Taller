// Variables globales para los gráficos
let vehiculosChart, marcasChart, clientesChart;

// Backend corre en un puerto distinto al de Live Server / servidor estático
const API_BASE = "http://localhost:3000";

// Cargar datos al iniciar
document.addEventListener('DOMContentLoaded', function() {
    loadDashboardData();
    loadNotifications();
    
    // Actualizar cada 60 segundos
    setInterval(loadDashboardData, 60000);
});

// Cargar todos los datos del dashboard
async function loadDashboardData() {
    try {
        console.log("🔄 Cargando datos del dashboard...");
        
        // Intentar cargar con los endpoints nuevos primero
        const [estadisticasRes, vehiculosRes] = await Promise.all([
            fetch(`${API_BASE}/dashboard/estadisticas`).then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            }),
            fetch(`${API_BASE}/dashboard/vehiculos-recientes`).then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
        ]);

        console.log("📊 Estadísticas recibidas:", estadisticasRes);
        
        // Actualizar estadísticas principales
        updateStatistics(estadisticasRes);
        
        // Actualizar tabla de vehículos recientes
        updateRecentVehiclesTable(vehiculosRes);
        
        // Crear/actualizar gráficos
        updateCharts(estadisticasRes);
        
        // Cargar resumen del día
        try {
            const resumenDia = await fetch(`${API_BASE}/dashboard/resumen-dia`).then(res => res.json());
            if (resumenDia && resumenDia.vehiculos_hoy !== undefined) {
                mostrarResumenDia(resumenDia);
            }
        } catch (resumenError) {
            console.warn("No se pudo cargar el resumen del día:", resumenError);
        }
        
        // Mostrar éxito
        showNotification('Datos actualizados correctamente', 'success');
        
    } catch (error) {
        console.error('❌ Error cargando datos del dashboard:', error);
        
        // Fallback a llamadas individuales
        await loadDashboardFallback();
        
        showNotification('Usando datos básicos. Algunas funciones pueden no estar disponibles.', 'warning');
    }
}

// Actualizar estadísticas
function updateStatistics(data) {
    const stats = [
        { id: 'totalClientes', value: data.totalClientes || 0 },
        { id: 'totalVehiculos', value: data.vehiculosEnTaller || 0 },
        { id: 'totalTrabajadores', value: data.totalTrabajadores || 0 },
        { id: 'totalInventario', value: data.totalInventario || 0 },
        { id: 'vehiculosPorCliente', value: data.vehiculosPorCliente || '0.0' },
        { id: 'vehiculosSemana', value: data.vehiculosPorSemana || '0.0' }
    ];
    
    stats.forEach(stat => {
        const element = document.getElementById(stat.id);
        if (element) {
            element.textContent = stat.value;
            // Animación de conteo
            animateCounter(element, stat.value);
        }
    });
}

// Animación de conteo
function animateCounter(element, targetValue) {
    const currentValue = parseInt(element.textContent) || 0;
    const target = parseInt(targetValue) || 0;
    
    if (currentValue === target) return;
    
    const duration = 500;
    const steps = 20;
    const increment = (target - currentValue) / steps;
    let currentStep = 0;
    
    const timer = setInterval(() => {
        currentStep++;
        const newValue = Math.round(currentValue + (increment * currentStep));
        element.textContent = newValue;
        
        if (currentStep >= steps) {
            element.textContent = target;
            clearInterval(timer);
        }
    }, duration / steps);
}

// Actualizar tabla de vehículos recientes
function updateRecentVehiclesTable(vehiculos) {
    const tableBody = document.getElementById('recentVehiclesTable');
    if (!tableBody) return;
    
    if (!vehiculos || vehiculos.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="no-data">
                    <i class="fas fa-car"></i>
                    No hay vehículos recientes
                </td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    vehiculos.forEach(vehiculo => {
        const entradaDate = new Date(vehiculo.Entrada);
        const fechaFormateada = entradaDate.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
        
        const estado = vehiculo.Salida ? 'Completado' : 'En taller';
        const estadoClass = vehiculo.Salida ? 'status-completed' : 'status-in-progress';
        
        html += `
            <tr>
                <td><strong>${vehiculo.Marca || 'N/A'}</strong></td>
                <td>${vehiculo.Modelo || 'N/A'}</td>
                <td>${vehiculo.Año || 'N/A'}</td>
                <td>${vehiculo.cliente_nombre?.trim() || 'Sin cliente'}</td>
                <td>${fechaFormateada}</td>
                <td><span class="status-badge ${estadoClass}">${estado}</span></td>
            </tr>
        `;
    });
    
    tableBody.innerHTML = html;
}

// Actualizar gráficos
function updateCharts(estadisticas) {
    // Destruir gráficos anteriores si existen
    if (vehiculosChart) vehiculosChart.destroy();
    if (marcasChart) marcasChart.destroy();
    if (clientesChart) clientesChart.destroy();
    
    // 1. Gráfico de vehículos por semana
    const ctx1 = document.getElementById('vehiculosSemanaChart');
    if (ctx1) {
        const semanasData = estadisticas.vehiculosUltimasSemanas || [];
        const semanasLabels = semanasData.map((item, index) => 
            `Sem ${semanasData.length - index}`
        );
        const semanasValores = semanasData.map(item => item.cantidad || 0);
        
        // Si no hay datos, usar datos de ejemplo
        if (semanasValores.length === 0) {
            semanasLabels.push('Sem 1', 'Sem 2', 'Sem 3', 'Sem 4');
            semanasValores.push(0, 0, 0, 0);
        }
        
        vehiculosChart = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: semanasLabels,
                datasets: [{
                    label: 'Vehículos',
                    data: semanasValores,
                    borderColor: '#b71c1c',
                    backgroundColor: 'rgba(183, 28, 28, 0.1)',
                    tension: 0.4,
                    fill: true,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#fff',
                        bodyColor: '#fff'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                }
            }
        });
    }
    
    // 2. Gráfico de distribución por marcas
    const ctx2 = document.getElementById('marcasChart');
    if (ctx2) {
        const marcasData = estadisticas.distribucionMarcas || [];
        const labels = marcasData.map(item => item.Marca);
        const valores = marcasData.map(item => item.cantidad);
        
        // Colores para las marcas
        const colores = [
            '#b71c1c', '#d32f2f', '#f44336', 
            '#e57373', '#ef9a9a', '#ffcdd2'
        ];
        
        marcasChart = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: valores,
                    backgroundColor: colores.slice(0, labels.length),
                    borderWidth: 1,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            padding: 20,
                            usePointStyle: true
                        }
                    }
                }
            }
        });
    }
    
    // 3. Gráfico de top clientes
    const ctx3 = document.getElementById('clientesVehiculosChart');
    if (ctx3) {
        const topClientesData = estadisticas.topClientes || [];
        const labels = topClientesData.map(item => 
            item.nombre.split(' ')[0] || `Cliente ${item.id_client}`
        );
        const valores = topClientesData.map(item => item.total_vehiculos || 0);
        
        clientesChart = new Chart(ctx3, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Vehículos',
                    data: valores,
                    backgroundColor: '#b71c1c',
                    borderColor: '#8b0000',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                }
            }
        });
    }
}

// Fallback si los endpoints nuevos no funcionan
async function loadDashboardFallback() {
    try {
        console.log("⚠️ Usando modo fallback...");
        
        const [clientesRes, vehiculosRes, trabajadoresRes, inventarioRes] = await Promise.all([
            fetch(`${API_BASE}/clientes`).then(res => res.json()).catch(() => []),
            fetch(`${API_BASE}/vehiculos`).then(res => res.json()).catch(() => []),
            fetch(`${API_BASE}/trabajadores`).then(res => res.json()).catch(() => []),
            fetch(`${API_BASE}/inventario`).then(res => res.json()).catch(() => [])
        ]);

        // Procesar datos manualmente
        const estadisticas = {
            totalClientes: clientesRes.length || 0,
            vehiculosEnTaller: vehiculosRes.filter(v => !v.Salida).length || 0,
            totalTrabajadores: trabajadoresRes.length || 0,
            totalInventario: inventarioRes.reduce((sum, item) => sum + (Number(item.cantidad) || 0), 0),
            vehiculosPorCliente: '0.0',
            vehiculosPorSemana: '0.0',
            distribucionMarcas: [],
            topClientes: [],
            vehiculosUltimasSemanas: []
        };

        // Actualizar estadísticas
        updateStatistics(estadisticas);
        
        // Actualizar tabla
        updateRecentVehiclesTable(vehiculosRes.slice(0, 10));
        
    } catch (error) {
        console.error('❌ Error en modo fallback:', error);
        showNotification('No se pudieron cargar los datos', 'error');
    }
}

// Cargar notificaciones
async function loadNotifications() {
    try {
        const response = await fetch(`${API_BASE}/notificaciones/citas-proximas`);
        if (!response.ok) throw new Error('Error en notificaciones');
        
        const citas = await response.json();
        const notificationsList = document.getElementById('notificationsList');
        
        if (!notificationsList) return;
        
        if (!citas || citas.length === 0) {
            notificationsList.innerHTML = '<p>No hay alertas nuevas por ahora.</p>';
            return;
        }
        
        let html = '<ul class="notifications-list">';
        citas.slice(0, 3).forEach(cita => {
            const fecha = new Date(cita.fecha_hora);
            const fechaStr = fecha.toLocaleDateString('es-ES', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            html += `
                <li>
                    <i class="fas fa-calendar-check"></i>
                    <div>
                        <strong>${cita.Name_trabajo || 'Cita'}</strong><br>
                        <small>${cita.pr_name || ''} - ${fechaStr}</small>
                    </div>
                </li>
            `;
        });
        html += '</ul>';
        
        if (citas.length > 3) {
            html += `<p class="more-notifications">+${citas.length - 3} más</p>`;
        }
        
        notificationsList.innerHTML = html;
    } catch (error) {
        console.warn('No se pudieron cargar notificaciones:', error);
    }
}

// Mostrar resumen del día
function mostrarResumenDia(resumen) {
    const existingResumen = document.querySelector('.resumen-dia');
    
    if (!resumen || (!resumen.vehiculos_hoy && !resumen.citas_hoy)) {
        if (existingResumen) existingResumen.remove();
        return;
    }
    
    const resumenHTML = `
        <div class="resumen-dia">
            <h4><i class="fas fa-calendar-day"></i> Resumen del Día</h4>
            <div class="resumen-stats">
                ${resumen.vehiculos_hoy ? `
                <div class="resumen-item">
                    <span class="resumen-label">Vehículos hoy:</span>
                    <span class="resumen-value">${resumen.vehiculos_hoy}</span>
                </div>` : ''}
                ${resumen.citas_hoy ? `
                <div class="resumen-item">
                    <span class="resumen-label">Citas hoy:</span>
                    <span class="resumen-value">${resumen.citas_hoy}</span>
                </div>` : ''}
                ${resumen.ingresos_hoy ? `
                <div class="resumen-item">
                    <span class="resumen-label">Ingresos hoy:</span>
                    <span class="resumen-value">$${parseFloat(resumen.ingresos_hoy).toFixed(2)}</span>
                </div>` : ''}
            </div>
        </div>
    `;
    
    if (existingResumen) {
        existingResumen.outerHTML = resumenHTML;
    } else {
        const notificationsBar = document.querySelector('.notifications-bar');
        if (notificationsBar) {
            notificationsBar.insertAdjacentHTML('afterend', resumenHTML);
        }
    }
}

// Mostrar notificación
function showNotification(message, type = 'info') {
    // Eliminar notificaciones anteriores
    const existing = document.querySelectorAll('.notification-toast');
    existing.forEach(el => el.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification-toast ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'error' ? 'exclamation-circle' : 
                         type === 'success' ? 'check-circle' : 
                         'info-circle'}"></i>
        <span>${message}</span>
        <button class="close-notification">&times;</button>
    `;
    
    document.body.appendChild(notification);
    
    // Cerrar al hacer click
    notification.querySelector('.close-notification').addEventListener('click', () => {
        notification.remove();
    });
    
    // Auto-remover después de 5 segundos
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

// Añadir estos estilos al archivo dash.css
const extraStyles = `
    /* Animación de conteo */
    .stat-number {
        transition: all 0.3s ease;
    }
    
    /* Tabla sin datos */
    .no-data {
        text-align: center;
        padding: 2rem !important;
        color: #6c757d;
    }
    
    .no-data i {
        font-size: 2rem;
        display: block;
        margin-bottom: 0.5rem;
        color: #b71c1c;
    }
    
    /* Notificaciones toast */
    .notification-toast {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        gap: 0.75rem;
        z-index: 9999;
        animation: slideInRight 0.3s ease;
        max-width: 350px;
        border-left: 4px solid;
    }
    
    .notification-toast.info {
        border-left-color: #17a2b8;
    }
    
    .notification-toast.success {
        border-left-color: #28a745;
    }
    
    .notification-toast.warning {
        border-left-color: #ffc107;
    }
    
    .notification-toast.error {
        border-left-color: #dc3545;
    }
    
    .notification-toast i {
        font-size: 1.2rem;
    }
    
    .notification-toast.success i {
        color: #28a745;
    }
    
    .notification-toast.error i {
        color: #dc3545;
    }
    
    .notification-toast.warning i {
        color: #ffc107;
    }
    
    .notification-toast.info i {
        color: #17a2b8;
    }
    
    .close-notification {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        color: #6c757d;
        margin-left: auto;
        padding: 0 0.5rem;
    }
    
    .close-notification:hover {
        color: #333;
    }
    
    /* Más notificaciones */
    .more-notifications {
        text-align: center;
        margin-top: 0.5rem;
        font-size: 0.9rem;
        color: #b71c1c;
        font-weight: 500;
    }
    
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;

// Agregar estilos al documento
document.addEventListener('DOMContentLoaded', function() {
    const style = document.createElement('style');
    style.textContent = extraStyles;
    document.head.appendChild(style);
});