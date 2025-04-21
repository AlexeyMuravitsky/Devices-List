const API_BASE = 'https://dev-space.su/api/v1';

// Временное хранилище списка девайсов и его мест. Каждая пара ключ=значение в объекте это deviceId и список мест(игроков)
const devicePlacesMap = {};

// Получаем список девайсов с сервера
async function fetchDevices() {
    try {
        const res = await fetch(`${API_BASE}/a/devices/`);
        if (!res.ok) throw new Error('Ошибка при получении девайсов');

        const devices = await res.json();
        renderDevices(devices);
    } catch (err) {
        document.getElementById('device-list').innerHTML = `
            <div class="alert alert-danger">Не удалось загрузить девайсы</div>
        `;
    }
}

// Создаем карточки всех девайсов и вставляем их в интерфейс
function renderDevices(devices) {
    const container = document.getElementById('device-list');
    container.innerHTML = '';

    devices.forEach((device) => {
        const col = document.createElement('div');
        col.className = 'col-md-4 mb-4';

        devicePlacesMap[device.id] = device.places;

        col.innerHTML = `
            <div class="card h-100 shadow-sm">
                <div class="card-body d-flex flex-column justify-content-between">
                    <div>
                        <h5 class="card-title">${device.name}</h5>
                        <p class="card-text">ID: ${device.id}</p>
                        <p class="card-text text-muted">Мест: ${
                            device.places.length
                        }</p>
                    </div>
                    <button class="btn btn-primary mt-3 w-100" onclick='openDevice(${
                        device.id
                    }, "${device.name.replace(/"/g, '&quot;')}")'>
                        Посмотреть игроков
                    </button>
                </div>
            </div>
        `;

        container.appendChild(col);
    });
}

// Модалка  которая отображает список всех игроков девайса
function openDevice(deviceId, deviceName) {
    const places = devicePlacesMap[deviceId];
    const modalBody = document.getElementById('modal-body');

    // Устанавливаем заголовок модалки с именем девайса
    document.getElementById('playersModalLabel').textContent = deviceName;
    modalBody.innerHTML = '';

    places.forEach((place) => {
        const playerHTML = `
            <div class="card mb-3 device-player-card">
                <div class="card-body">
                    <h6 class="card-title">Игрок #${place.place}</h6>
                    <p>Баланс: <span id="balance-${deviceId}-${place.place}">${place.balances}</span> ${place.currency}</p>

                    <div class="d-flex justify-content-between mb-3">
                        <input
                            type="text"
                            inputmode="numeric"
                            class="form-control input-small"
                            id="amount-${deviceId}-${place.place}"
                            placeholder="Сумма"
                        />
                        <div class="pinpad" data-target="amount-${deviceId}-${place.place}"></div>
                    </div>

                    <div class="d-flex gap-2">
                        <button class="btn btn-success w-50" onclick="updateBalance(${deviceId}, ${place.place}, true)">Внести</button>
                        <button class="btn btn-danger w-50" onclick="updateBalance(${deviceId}, ${place.place}, false)">Снять</button>
                    </div>

                    <div id="error-${deviceId}-${place.place}" class="text-danger mt-2"></div>
                </div>
            </div>
        `;

        modalBody.insertAdjacentHTML('beforeend', playerHTML);
        renderPinpad(`amount-${deviceId}-${place.place}`);
    });

    const modal = new bootstrap.Modal(document.getElementById('playersModal'));
    modal.show();
}

// Отправляет запрос на изменение баланса игрока
async function updateBalance(deviceId, placeId, isDeposit) {
    const input = document.getElementById(`amount-${deviceId}-${placeId}`);
    const errorDiv = document.getElementById(`error-${deviceId}-${placeId}`);
    const balanceSpan = document.getElementById(
        `balance-${deviceId}-${placeId}`,
    );

    const depositBtn = document.querySelector(
        `button[onclick="updateBalance(${deviceId}, ${placeId}, true)"]`,
    );
    const withdrawBtn = document.querySelector(
        `button[onclick="updateBalance(${deviceId}, ${placeId}, false)"]`,
    );

    if (depositBtn.disabled || withdrawBtn.disabled) return;

    const rawValue = input.value.trim();
    const value = parseInt(rawValue);

    const delta = isDeposit ? value : -value;

    input.value = '';
    errorDiv.textContent = '';

    if (isNaN(value) || value <= 0) {
        showError(deviceId, placeId, 'Введите корректную сумму');
        return;
    }

    const currentBalance = parseInt(balanceSpan.textContent);
    if (!isDeposit && value > currentBalance) {
        showError(deviceId, placeId, 'Недостаточно средств');
        return;
    }

    depositBtn.disabled = true;
    withdrawBtn.disabled = true;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
        const res = await fetch(
            `${API_BASE}/a/devices/${deviceId}/place/${placeId}/update`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ delta }),
                signal: controller.signal,
            },
        );

        clearTimeout(timeoutId);

        if (!res.ok) {
            showError(deviceId, placeId, `Ошибка сервера: ${res.status}`);
            return;
        }

        const data = await res.json();

        if (data.err) {
            showError(deviceId, placeId, data.err || 'Ошибка при обновлении');
            return;
        }

        balanceSpan.textContent = currentBalance + delta;
    } catch (err) {
        clearTimeout(timeoutId);
        const msg =
            err.name === 'AbortError' ? 'Сервер не отвечает' : 'Ошибка сети';
        showError(deviceId, placeId, msg);
    } finally {
        depositBtn.disabled = false;
        withdrawBtn.disabled = false;
    }
}

// Показываем ошибку на экране с автозакрытием через 2 сек
function showError(deviceId, placeId, message) {
    const errorDiv = document.getElementById(`error-${deviceId}-${placeId}`);
    errorDiv.innerHTML = '';

    const alert = document.createElement('div');
    alert.className = 'alert alert-danger py-2 px-3 mb-0 fade show';
    alert.setAttribute('role', 'alert');
    alert.textContent = message;

    errorDiv.appendChild(alert);

    setTimeout(() => {
        alert.classList.remove('show');
        setTimeout(() => {
            alert.remove();
        }, 300);
    }, 2000);
}

// Реализация пинпада
function renderPinpad(inputId) {
    const pinpad = document.querySelector(`.pinpad[data-target="${inputId}"]`);
    const buttons = [
        '1',
        '2',
        '3',
        '4',
        '5',
        '6',
        '7',
        '8',
        '9',
        '0',
        '←',
        'C',
    ];

    pinpad.innerHTML = '';
    pinpad.className = 'pinpad d-grid gap-2';
    pinpad.style.display = 'grid';
    pinpad.style.gridTemplateColumns = 'repeat(3, 60px)';
    pinpad.style.gap = '8px';

    buttons.forEach((symbol) => {
        const btn = document.createElement('button');
        btn.className =
            'btn btn-outline-secondary d-flex justify-content-center align-items-center pinpad-btn';
        btn.textContent = symbol;

        btn.onclick = () => {
            const input = document.getElementById(inputId);
            if (!input) return;

            if (symbol === 'C') {
                input.value = '';
            } else if (symbol === '←') {
                input.value = input.value.slice(0, -1);
            } else {
                input.value += symbol;
            }
        };

        pinpad.appendChild(btn);
    });
}

fetchDevices();
