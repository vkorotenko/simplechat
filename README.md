# Тихий чат

Самостоятельно размещаемый чат: регистрация только по логину, комнаты с необязательным паролем, отправка текста и изображений. Интерфейс адаптирован для телефонов и планшетов, а оболочку можно установить как PWA.

## Запуск

Требуется Python 3.10 или новее.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:ADMIN_TOKEN = "replace-with-a-long-random-admin-token"
$env:SESSION_SECRET = "replace-with-a-long-random-session-secret"
uvicorn main:app --reload
```

Откройте `http://127.0.0.1:8000`. Создание комнат находится по адресу `/admin`. На сервере задайте собственные `ADMIN_TOKEN` и `SESSION_SECRET`; при незаданном `SESSION_SECRET` приложение создаёт случайный секрет, поэтому существующие сессии сбросятся после перезапуска.

У каждой комнаты есть прямая ссылка вида `/c_<id>` (например, `/c_12`). Она открывает комнату после входа; при выборе комнаты из списка адресная строка обновляется.

При входе в комнату показываются последние 50 сообщений, а фокус устанавливается в поле ввода. Кнопка «Загрузить более старые» позволяет просматривать историю выше, не сбивая текущую позицию.

## База данных

По умолчанию используется SQLite в файле `simplechat.db`. Выберите другую СУБД переменной `DATABASE_URL`:

```text
mysql+pymysql://user:password@localhost/simplechat
postgresql+psycopg://user:password@localhost/simplechat
```

Драйверы MySQL и PostgreSQL уже перечислены в `requirements.txt`.

## Настройки

- `DATABASE_URL` — строка подключения, по умолчанию `sqlite:///./simplechat.db`.
- `ADMIN_TOKEN` — обязательный ключ для создания комнат через админ-панель.
- `SESSION_SECRET` — постоянный случайный секрет для подписи сессий; задайте его перед размещением приложения.
- `COOKIE_SECURE=1` — включает флаг Secure для cookie при работе через HTTPS.
- Администратор может удалять комнаты целиком вместе с сообщениями и загруженными изображениями на странице `/admin`.

Загруженные изображения сохраняются в `upload/`, принимаются JPG, PNG, WebP и GIF размером до 5 МБ.

## Удаление комнат и сообщений

Удаление выполняется только с действующим ключом `ADMIN_TOKEN`.

### Через админ-панель

1. Откройте `/admin`.
2. Введите ключ администратора.
3. Найдите комнату в разделе «Существующие комнаты».
4. Нажмите «Показать сообщения», чтобы открыть список сообщений комнаты.
5. Для удаления одного сообщения нажмите «Удалить» рядом с ним и подтвердите действие.
6. Для удаления всей комнаты нажмите «Удалить» рядом с названием и подтвердите действие.

Удаление комнаты удаляет комнату, все её сообщения и связанные загруженные изображения.

### Через API

Удалить комнату целиком:

```powershell
$headers = @{ "X-Admin-Token" = "ваш-ключ-ADMIN-TOKEN" }
Invoke-RestMethod -Method Delete -Uri "https://ваш-домен/api/admin/rooms/<room_id>" -Headers $headers
```

Удалить отдельное сообщение из комнаты:

```powershell
$headers = @{ "X-Admin-Token" = "ваш-ключ-ADMIN-TOKEN" }
Invoke-RestMethod -Method Delete -Uri "https://ваш-домен/api/admin/rooms/<room_id>/messages/<message_id>" -Headers $headers
```

Можно удалить сообщение по его ID без указания комнаты:

```powershell
$headers = @{ "X-Admin-Token" = "ваш-ключ-ADMIN-TOKEN" }
Invoke-RestMethod -Method Delete -Uri "https://ваш-домен/api/admin/messages/<message_id>" -Headers $headers
```

При удалении сообщения с изображением файл изображения также удаляется из `upload/`.

## Важно

Вход намеренно выполняется только по логину, без пароля и подтверждения владения именем. Поэтому любой посетитель может войти под уже выбранным логином. Не используйте такой режим для приватных переписок или как подтверждение личности. Пароль комнаты ограничивает вход в неё, но не превращает логин в персональную учётную запись.

Service worker кэширует только оболочку приложения. Для входа и обмена сообщениями требуется соединение с сервером.

## Размещение на Linux

Все конфигурационные файлы и данные приложения хранятся внутри `/opt/simplechat`: unit и Nginx-конфиг в `deploy/`, переменные окружения в `simplechat.env`, SQLite и загруженные файлы в `data/` и `upload/`. Системные каталоги `/etc/systemd/system` и `/etc/nginx/sites-enabled` содержат только symlinks на конфиги из `/opt/simplechat`. Примеры рассчитаны на пользователя и группу `simplechat`, а также Uvicorn на `127.0.0.1:8000`.

1. Разместите файлы приложения в `/opt/simplechat`, создайте системного пользователя и каталоги данных:

	```sh
	sudo useradd --system --home /opt/simplechat --shell /usr/sbin/nologin simplechat
	sudo install -d -o root -g root /opt/simplechat
	sudo install -d -o simplechat -g simplechat /opt/simplechat/upload /opt/simplechat/data
	sudo python3 -m venv /opt/simplechat/.venv
	sudo /opt/simplechat/.venv/bin/pip install -r /opt/simplechat/requirements.txt
	```

2. Создайте `/opt/simplechat/simplechat.env` по шаблону, задайте уникальные `ADMIN_TOKEN` и `SESSION_SECRET`, затем создайте symlink unit-файла:

	```sh
	sudo install -o root -g root -m 600 deploy/simplechat.env.example /opt/simplechat/simplechat.env
	sudo ln -sfn /opt/simplechat/deploy/systemd/simplechat.service /etc/systemd/system/simplechat.service
	sudo systemctl daemon-reload
	sudo systemctl enable --now simplechat
	sudo systemctl status simplechat
	```

3. В `/opt/simplechat/deploy/nginx/simplechat.conf` замените `chat.example.com` на свой домен, создайте Nginx symlink и проверьте конфигурацию:

	```sh
	sudo ln -sfn /opt/simplechat/deploy/nginx/simplechat.conf /etc/nginx/sites-enabled/simplechat
	sudo nginx -t
	sudo systemctl reload nginx
	```

	Пример обслуживает HTTP; для публичного сервера настройте TLS (например, Certbot), затем установите `COOKIE_SECURE=1` в `/opt/simplechat/simplechat.env` и перезапустите `simplechat`. До настройки TLS оставьте `COOKIE_SECURE=0`, иначе браузер не будет отправлять cookie по HTTP. Не публикуйте порт 8000 наружу: Nginx проксирует запросы к Uvicorn через localhost.
