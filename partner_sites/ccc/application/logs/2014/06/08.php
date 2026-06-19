<?php defined('SYSPATH') OR die('No direct script access.'); ?>

2014-06-08 02:09:02 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:09:02 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:09:26 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:09:26 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:09:27 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:09:27 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:09:28 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:09:28 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:09:28 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:09:28 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:14:58 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:14:58 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:22:13 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:22:13 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:22:14 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:22:14 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:22:14 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:22:14 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:22:49 --- EMERGENCY: ErrorException [ 1 ]: Class 'Database' not found ~ MODPATH/mysqli/classes/Kohana/Database/MySQLi.php [ 10 ] in file:line
2014-06-08 02:22:49 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 02:23:35 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:23:35 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:25:42 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:25:42 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:25:43 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:25:43 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:25:43 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:25:43 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:25:43 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:25:43 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:25:50 --- EMERGENCY: ErrorException [ 1 ]: Class 'Database_MySQLi' not found ~ APPPATH/classes/Model/Comics.php [ 7 ] in file:line
2014-06-08 02:25:50 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 02:25:54 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:25:54 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-08 02:26:08 --- EMERGENCY: ErrorException [ 1 ]: Class 'Database' not found ~ MODPATH/mysqli/classes/Kohana/Database/MySQLi.php [ 10 ] in file:line
2014-06-08 02:26:08 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 02:30:26 --- EMERGENCY: ErrorException [ 8 ]: Trying to get property of non-object ~ MODPATH/mysqli/classes/Kohana/Database/MySQLi.php [ 66 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/mysqli/classes/Kohana/Database/MySQLi.php:66
2014-06-08 02:30:26 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/mysqli/classes/Kohana/Database/MySQLi.php(66): Kohana_Core::error_handler(8, 'Trying to get p...', '/Applications/M...', 66, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/modules/mysqli/classes/Kohana/Database/MySQLi.php(159): Kohana_Database_MySQLi->connect()
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQLi->query('SELECT', 'SELECT * FROM "...')
#3 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#5 [internal function]: Kohana_Controller->execute()
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#9 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#10 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/mysqli/classes/Kohana/Database/MySQLi.php:66
2014-06-08 02:37:40 --- EMERGENCY: Database_Exception [ 1064 ]: [1064] You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '"comics"' at line 1 ( SELECT * FROM "comics" ) ~ MODPATH/mysqli/classes/Kohana/Database/MySQLi.php [ 182 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:7
2014-06-08 02:37:40 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQLi->query('SELECT', 'SELECT * FROM "...')
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:7
2014-06-08 02:38:58 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: query ~ APPPATH/classes/Model/Comics.php [ 8 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:8
2014-06-08 02:38:58 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(8): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 8, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:8
2014-06-08 02:40:36 --- EMERGENCY: ErrorException [ 1 ]: Call to a member function execute() on a non-object ~ APPPATH/classes/Model/Comics.php [ 8 ] in file:line
2014-06-08 02:40:36 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 02:43:40 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: result ~ APPPATH/classes/Model/Comics.php [ 10 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:10
2014-06-08 02:43:40 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(10): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 10, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:10
2014-06-08 02:47:44 --- EMERGENCY: ErrorException [ 1 ]: Call to a member function fetch_assoc() on a non-object ~ APPPATH/classes/Model/Comics.php [ 9 ] in file:line
2014-06-08 02:47:44 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 02:49:02 --- EMERGENCY: ErrorException [ 1 ]: Call to a member function fetch_assoc() on a non-object ~ APPPATH/classes/Model/Comics.php [ 10 ] in file:line
2014-06-08 02:49:02 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 02:51:37 --- EMERGENCY: ErrorException [ 4 ]: syntax error, unexpected 'var_dump' (T_STRING) ~ APPPATH/classes/Model/Comics.php [ 16 ] in file:line
2014-06-08 02:51:37 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 02:51:47 --- EMERGENCY: ErrorException [ 4 ]: syntax error, unexpected 'var_dump' (T_STRING) ~ APPPATH/classes/Model/Comics.php [ 16 ] in file:line
2014-06-08 02:51:47 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 03:00:48 --- EMERGENCY: ErrorException [ 8 ]: Undefined index: img ~ APPPATH/classes/Controller/Comics.php [ 12 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:12
2014-06-08 03:00:48 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(12): Kohana_Core::error_handler(8, 'Undefined index...', '/Applications/M...', 12, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#2 [internal function]: Kohana_Controller->execute()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#6 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#7 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:12
2014-06-08 03:01:03 --- EMERGENCY: ErrorException [ 8 ]: Undefined index: img ~ APPPATH/classes/Controller/Comics.php [ 12 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:12
2014-06-08 03:01:03 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(12): Kohana_Core::error_handler(8, 'Undefined index...', '/Applications/M...', 12, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#2 [internal function]: Kohana_Controller->execute()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#6 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#7 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:12
2014-06-08 03:01:28 --- EMERGENCY: ErrorException [ 8 ]: Undefined index: img ~ APPPATH/classes/Controller/Comics.php [ 13 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:13
2014-06-08 03:01:28 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(13): Kohana_Core::error_handler(8, 'Undefined index...', '/Applications/M...', 13, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#2 [internal function]: Kohana_Controller->execute()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#6 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#7 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:13
2014-06-08 03:01:29 --- EMERGENCY: ErrorException [ 8 ]: Undefined index: img ~ APPPATH/classes/Controller/Comics.php [ 13 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:13
2014-06-08 03:01:29 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(13): Kohana_Core::error_handler(8, 'Undefined index...', '/Applications/M...', 13, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#2 [internal function]: Kohana_Controller->execute()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#6 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#7 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:13
2014-06-08 03:02:45 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic_url ~ APPPATH/views/Main.php [ 3 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:02:45 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(3): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 3, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:04:22 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic_url ~ APPPATH/views/Main.php [ 3 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:04:22 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(3): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 3, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:04:24 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic_url ~ APPPATH/views/Main.php [ 3 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:04:24 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(3): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 3, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:04:43 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic_url ~ APPPATH/views/Main.php [ 3 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:04:43 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(3): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 3, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:04:44 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic_url ~ APPPATH/views/Main.php [ 3 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:04:44 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(3): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 3, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:04:44 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic_url ~ APPPATH/views/Main.php [ 3 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:04:44 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(3): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 3, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:21:23 --- EMERGENCY: ErrorException [ 4 ]: syntax error, unexpected ';' ~ APPPATH/classes/Controller/Comics.php [ 15 ] in file:line
2014-06-08 03:21:23 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 03:21:29 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic_url ~ APPPATH/views/Main.php [ 3 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:21:29 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(3): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 3, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:21:46 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic_url ~ APPPATH/views/Main.php [ 3 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:21:46 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(3): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 3, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:21:56 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic_url ~ APPPATH/views/Main.php [ 3 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:21:56 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(3): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 3, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:22:12 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic_url ~ APPPATH/views/Main.php [ 3 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:22:12 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(3): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 3, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:22:25 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic_url ~ APPPATH/views/Main.php [ 3 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:22:25 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(3): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 3, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:22:40 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic_url ~ APPPATH/views/Main.php [ 3 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:22:40 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(3): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 3, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:22:54 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic_url ~ APPPATH/views/Main.php [ 3 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:22:54 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(3): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 3, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:23:31 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic_url ~ APPPATH/views/Main.php [ 3 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:23:31 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(3): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 3, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:23:32 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic_url ~ APPPATH/views/Main.php [ 3 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:23:32 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(3): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 3, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:24:28 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic_url ~ APPPATH/views/Main.php [ 3 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:24:28 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(3): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 3, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:27:09 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic_url ~ APPPATH/views/Main.php [ 3 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:27:09 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(3): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 3, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:32:30 --- EMERGENCY: ErrorException [ 1 ]: Cannot pass parameter 2 by reference ~ APPPATH/classes/Controller/Comics.php [ 22 ] in file:line
2014-06-08 03:32:30 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 03:32:48 --- EMERGENCY: ErrorException [ 8 ]: Use of undefined constant temp - assumed 'temp' ~ APPPATH/classes/Controller/Comics.php [ 23 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:23
2014-06-08 03:32:48 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(23): Kohana_Core::error_handler(8, 'Use of undefine...', '/Applications/M...', 23, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#2 [internal function]: Kohana_Controller->execute()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#6 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#7 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:23
2014-06-08 03:34:04 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic_url ~ APPPATH/views/Main.php [ 3 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:34:04 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(3): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 3, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:34:16 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic_url ~ APPPATH/views/Main.php [ 3 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:34:16 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(3): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 3, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:34:17 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic_url ~ APPPATH/views/Main.php [ 3 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:34:17 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(3): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 3, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:34:24 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic_url ~ APPPATH/views/Main.php [ 3 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:34:24 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(3): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 3, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:43:25 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic_url ~ APPPATH/views/Main.php [ 3 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:43:25 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(3): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 3, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:47:06 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: content ~ APPPATH/views/Main.php [ 3 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:47:06 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(3): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 3, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:3
2014-06-08 03:49:01 --- EMERGENCY: ErrorException [ 4 ]: syntax error, unexpected '->' (T_OBJECT_OPERATOR) ~ APPPATH/classes/Controller/Comics.php [ 23 ] in file:line
2014-06-08 03:49:01 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 03:51:46 --- EMERGENCY: ErrorException [ 4 ]: syntax error, unexpected '->' (T_OBJECT_OPERATOR) ~ APPPATH/classes/Controller/Comics.php [ 23 ] in file:line
2014-06-08 03:51:46 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 03:57:50 --- EMERGENCY: ErrorException [ 4 ]: syntax error, unexpected '$comic_title' (T_VARIABLE) ~ APPPATH/classes/Controller/Comics.php [ 26 ] in file:line
2014-06-08 03:57:50 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 04:21:35 --- EMERGENCY: Database_Exception [ 1064 ]: [1064] You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near 'RAND() LIMIT 1' at line 1 ( SELECT * FROM `comics` ORDER BY `Date` RAND() LIMIT 1 ) ~ MODPATH/mysqli/classes/Kohana/Database/MySQLi.php [ 182 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/Query.php:251
2014-06-08 04:21:35 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/Query.php(251): Kohana_Database_MySQLi->query(1, 'SELECT * FROM `...', false, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(17): Kohana_Database_Query->execute()
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(20): Model_Comics->getRandomComicUrl()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/Query.php:251
2014-06-08 04:21:54 --- EMERGENCY: Database_Exception [ 1054 ]: [1054] Unknown column 'Rand()' in 'order clause' ( SELECT * FROM `comics` ORDER BY `Rand()` LIMIT 1 ) ~ MODPATH/mysqli/classes/Kohana/Database/MySQLi.php [ 182 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/Query.php:251
2014-06-08 04:21:54 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/Query.php(251): Kohana_Database_MySQLi->query(1, 'SELECT * FROM `...', false, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(17): Kohana_Database_Query->execute()
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(20): Model_Comics->getRandomComicUrl()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/Query.php:251
2014-06-08 04:23:56 --- EMERGENCY: ErrorException [ 2 ]: mysqli_query() expects at least 2 parameters, 1 given ~ APPPATH/classes/Model/Comics.php [ 16 ] in file:line
2014-06-08 04:23:56 --- DEBUG: #0 [internal function]: Kohana_Core::error_handler(2, 'mysqli_query() ...', '/Applications/M...', 16, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(16): mysqli_query('Select * FROM c...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(20): Model_Comics->getRandomComicUrl()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in file:line
2014-06-08 04:25:00 --- EMERGENCY: ErrorException [ 1 ]: Non-static method mysqli::query() cannot be called statically, assuming $this from incompatible context ~ APPPATH/classes/Model/Comics.php [ 16 ] in file:line
2014-06-08 04:25:00 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 04:25:14 --- EMERGENCY: ErrorException [ 2 ]: Missing argument 2 for Kohana_DB::query(), called in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php on line 16 and defined ~ MODPATH/database/classes/Kohana/DB.php [ 42 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/DB.php:42
2014-06-08 04:25:14 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/DB.php(42): Kohana_Core::error_handler(2, 'Missing argumen...', '/Applications/M...', 42, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(16): Kohana_DB::query('Select * FROM c...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(20): Model_Comics->getRandomComicUrl()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/DB.php:42
2014-06-08 04:25:33 --- EMERGENCY: Database_Exception [ 1064 ]: [1064] You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near 'RAND() LIMIT 1' at line 1 ( Select * FROM comics ORDER_BY RAND() LIMIT 1 ) ~ MODPATH/mysqli/classes/Kohana/Database/MySQLi.php [ 182 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/Query.php:251
2014-06-08 04:25:33 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/Query.php(251): Kohana_Database_MySQLi->query('SELECT', 'Select * FROM c...', false, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(17): Kohana_Database_Query->execute()
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(20): Model_Comics->getRandomComicUrl()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/Query.php:251
2014-06-08 04:27:25 --- EMERGENCY: ErrorException [ 1 ]: Call to a member function as_array() on a non-object ~ APPPATH/classes/Model/Comics.php [ 17 ] in file:line
2014-06-08 04:27:25 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 04:27:25 --- EMERGENCY: ErrorException [ 1 ]: Call to a member function as_array() on a non-object ~ APPPATH/classes/Model/Comics.php [ 17 ] in file:line
2014-06-08 04:27:25 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 04:28:22 --- EMERGENCY: ErrorException [ 1 ]: Call to a member function as_array() on a non-object ~ APPPATH/classes/Model/Comics.php [ 17 ] in file:line
2014-06-08 04:28:22 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 04:31:11 --- EMERGENCY: ErrorException [ 1 ]: Call to undefined method Database_Query::use_result() ~ APPPATH/classes/Model/Comics.php [ 16 ] in file:line
2014-06-08 04:31:11 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 04:31:31 --- EMERGENCY: ErrorException [ 1 ]: Call to undefined method Database_Query::use_result() ~ APPPATH/classes/Model/Comics.php [ 17 ] in file:line
2014-06-08 04:31:31 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 04:31:46 --- EMERGENCY: ErrorException [ 1 ]: Call to undefined method DB::real_query() ~ APPPATH/classes/Model/Comics.php [ 16 ] in file:line
2014-06-08 04:31:46 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 04:33:48 --- EMERGENCY: ErrorException [ 8 ]: Undefined property: Database_MySQLi_Result::$as_array ~ APPPATH/classes/Model/Comics.php [ 17 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:17
2014-06-08 04:33:48 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(17): Kohana_Core::error_handler(8, 'Undefined prope...', '/Applications/M...', 17, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(20): Model_Comics->getRandomComicUrl()
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:17
2014-06-08 04:36:51 --- EMERGENCY: ErrorException [ 8 ]: Array to string conversion ~ APPPATH/views/Main.php [ 20 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:20
2014-06-08 04:36:51 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(20): Kohana_Core::error_handler(8, 'Array to string...', '/Applications/M...', 20, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:20
2014-06-08 04:44:15 --- EMERGENCY: ErrorException [ 2 ]: Missing argument 1 for Model_Comics::getNextComicUrl(), called in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php on line 21 and defined ~ APPPATH/classes/Model/Comics.php [ 22 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:22
2014-06-08 04:44:15 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(22): Kohana_Core::error_handler(2, 'Missing argumen...', '/Applications/M...', 22, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(21): Model_Comics->getNextComicUrl()
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:22
2014-06-08 04:45:10 --- EMERGENCY: ErrorException [ 8 ]: Array to string conversion ~ APPPATH/views/Main.php [ 25 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:25
2014-06-08 04:45:10 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(25): Kohana_Core::error_handler(8, 'Array to string...', '/Applications/M...', 25, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:25
2014-06-08 04:49:04 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: title ~ APPPATH/views/Main.php [ 4 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:4
2014-06-08 04:49:04 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(4): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 4, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:4
2014-06-08 18:00:54 --- EMERGENCY: ErrorException [ 1 ]: Class 'Routes_Comic' not found ~ APPPATH/bootstrap.php [ 147 ] in file:line
2014-06-08 18:00:54 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:01:54 --- EMERGENCY: ErrorException [ 1 ]: Class 'Routes_Comic' not found ~ APPPATH/bootstrap.php [ 147 ] in file:line
2014-06-08 18:01:54 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:02:21 --- EMERGENCY: ErrorException [ 1 ]: Class 'Routes' not found ~ APPPATH/classes/Routes/Comic.php [ 3 ] in file:line
2014-06-08 18:02:21 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:02:45 --- EMERGENCY: ErrorException [ 1 ]: Class 'Routes_Comic' not found ~ APPPATH/bootstrap.php [ 147 ] in file:line
2014-06-08 18:02:45 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:02:49 --- EMERGENCY: ErrorException [ 1 ]: Class 'Routes_Comic' not found ~ APPPATH/bootstrap.php [ 147 ] in file:line
2014-06-08 18:02:49 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:02:49 --- EMERGENCY: ErrorException [ 1 ]: Class 'Routes_Comic' not found ~ APPPATH/bootstrap.php [ 147 ] in file:line
2014-06-08 18:02:49 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:02:49 --- EMERGENCY: ErrorException [ 1 ]: Class 'Routes_Comic' not found ~ APPPATH/bootstrap.php [ 147 ] in file:line
2014-06-08 18:02:49 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:02:49 --- EMERGENCY: ErrorException [ 1 ]: Class 'Routes_Comic' not found ~ APPPATH/bootstrap.php [ 147 ] in file:line
2014-06-08 18:02:49 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:03:00 --- EMERGENCY: ErrorException [ 1 ]: Class 'Routes' not found ~ APPPATH/classes/Route/Comic.php [ 3 ] in file:line
2014-06-08 18:03:00 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:03:01 --- EMERGENCY: ErrorException [ 1 ]: Class 'Routes' not found ~ APPPATH/classes/Route/Comic.php [ 3 ] in file:line
2014-06-08 18:03:01 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:03:42 --- EMERGENCY: ErrorException [ 1 ]: Class 'Routes_Comic' not found ~ APPPATH/bootstrap.php [ 147 ] in file:line
2014-06-08 18:03:42 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:04:18 --- EMERGENCY: ErrorException [ 1 ]: Class 'Routes_Comic' not found ~ APPPATH/bootstrap.php [ 147 ] in file:line
2014-06-08 18:04:18 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:04:19 --- EMERGENCY: ErrorException [ 1 ]: Class 'Routes_Comic' not found ~ APPPATH/bootstrap.php [ 147 ] in file:line
2014-06-08 18:04:19 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:04:19 --- EMERGENCY: ErrorException [ 1 ]: Class 'Routes_Comic' not found ~ APPPATH/bootstrap.php [ 147 ] in file:line
2014-06-08 18:04:19 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:04:36 --- EMERGENCY: ErrorException [ 1 ]: Class 'Routes' not found ~ APPPATH/classes/Routes/Comic.php [ 3 ] in file:line
2014-06-08 18:04:36 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:06:00 --- EMERGENCY: ErrorException [ 1 ]: Class 'Route_Comic' not found ~ APPPATH/bootstrap.php [ 147 ] in file:line
2014-06-08 18:06:00 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:06:01 --- EMERGENCY: ErrorException [ 1 ]: Class 'Route_Comic' not found ~ APPPATH/bootstrap.php [ 147 ] in file:line
2014-06-08 18:06:01 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:06:09 --- EMERGENCY: ErrorException [ 1 ]: Class 'Route_Comic' not found ~ APPPATH/bootstrap.php [ 147 ] in file:line
2014-06-08 18:06:09 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:06:09 --- EMERGENCY: ErrorException [ 1 ]: Class 'Route_Comic' not found ~ APPPATH/bootstrap.php [ 147 ] in file:line
2014-06-08 18:06:09 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:06:09 --- EMERGENCY: ErrorException [ 1 ]: Class 'Route_Comic' not found ~ APPPATH/bootstrap.php [ 147 ] in file:line
2014-06-08 18:06:09 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:06:39 --- EMERGENCY: ErrorException [ 1 ]: Class 'Routes_Comics' not found ~ APPPATH/bootstrap.php [ 147 ] in file:line
2014-06-08 18:06:39 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:06:40 --- EMERGENCY: ErrorException [ 1 ]: Class 'Routes_Comics' not found ~ APPPATH/bootstrap.php [ 147 ] in file:line
2014-06-08 18:06:40 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:06:40 --- EMERGENCY: ErrorException [ 1 ]: Class 'Routes_Comics' not found ~ APPPATH/bootstrap.php [ 147 ] in file:line
2014-06-08 18:06:40 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:12:43 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: content ~ APPPATH/views/template.php [ 19 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:12:43 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 19, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:14:57 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: content ~ APPPATH/views/template.php [ 19 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:14:57 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 19, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:15:00 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: content ~ APPPATH/views/template.php [ 19 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:15:00 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 19, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:15:14 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: content ~ APPPATH/views/template.php [ 19 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:15:14 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 19, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:15:15 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: content ~ APPPATH/views/template.php [ 19 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:15:15 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 19, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:15:16 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: content ~ APPPATH/views/template.php [ 19 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:15:16 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 19, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:15:16 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: content ~ APPPATH/views/template.php [ 19 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:15:16 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 19, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:15:16 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: content ~ APPPATH/views/template.php [ 19 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:15:16 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 19, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:15:24 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: content ~ APPPATH/views/template.php [ 19 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:15:24 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 19, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:15:24 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: content ~ APPPATH/views/template.php [ 19 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:15:24 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 19, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:15:24 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: content ~ APPPATH/views/template.php [ 19 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:15:24 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 19, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:15:26 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: content ~ APPPATH/views/template.php [ 19 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:15:26 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 19, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:22:13 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: content ~ APPPATH/views/template.php [ 19 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:22:13 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 19, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:24:02 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: content ~ APPPATH/views/template.php [ 19 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:24:02 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 19, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:25:01 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: content ~ APPPATH/views/template.php [ 19 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:25:01 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 19, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:25:07 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: content ~ APPPATH/views/template.php [ 19 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:25:07 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 19, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:26:41 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: content ~ APPPATH/views/template.php [ 19 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:26:41 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 19, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:26:53 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: content ~ APPPATH/views/template.php [ 19 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:26:53 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 19, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:19
2014-06-08 18:29:04 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comicsModel ~ APPPATH/classes/Controller/Comics.php [ 40 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:40
2014-06-08 18:29:04 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(40): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 40, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#2 [internal function]: Kohana_Controller->execute()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#6 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#7 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:40
2014-06-08 18:30:09 --- EMERGENCY: ErrorException [ 1 ]: Call to undefined method Database_Query_Builder_Select::exec() ~ APPPATH/classes/Model/Comics.php [ 33 ] in file:line
2014-06-08 18:30:09 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-08 18:30:36 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: latestComic ~ APPPATH/classes/Controller/Comics.php [ 46 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:46
2014-06-08 18:30:36 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(46): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 46, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#2 [internal function]: Kohana_Controller->execute()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#6 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#7 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:46
2014-06-08 18:43:00 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 26 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:26
2014-06-08 18:43:00 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(26): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 26, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(46): Model_Comics->getNextComicUrl('0000-00-00 00:0...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:26
2014-06-08 18:43:14 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 26 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:26
2014-06-08 18:43:14 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(26): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 26, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(46): Model_Comics->getNextComicUrl('0000-00-00 00:0...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:26
2014-06-08 18:44:05 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 26 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:26
2014-06-08 18:44:05 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(26): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 26, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(46): Model_Comics->getNextComicUrl('0000-00-00 00:0...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:26
2014-06-08 18:44:06 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 26 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:26
2014-06-08 18:44:06 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(26): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 26, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(46): Model_Comics->getNextComicUrl('0000-00-00 00:0...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:26
2014-06-08 18:44:12 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 26 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:26
2014-06-08 18:44:12 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(26): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 26, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(46): Model_Comics->getNextComicUrl('0000-00-00 00:0...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:26
2014-06-08 18:44:12 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 26 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:26
2014-06-08 18:44:12 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(26): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 26, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(46): Model_Comics->getNextComicUrl('0000-00-00 00:0...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:26
2014-06-08 18:44:13 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 26 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:26
2014-06-08 18:44:13 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(26): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 26, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(46): Model_Comics->getNextComicUrl('0000-00-00 00:0...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:26
2014-06-08 18:44:51 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 34 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:34
2014-06-08 18:44:51 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(34): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 34, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(47): Model_Comics->getPrevComicUrl('2031-12-10 06:3...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:34
2014-06-08 18:45:03 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 34 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:34
2014-06-08 18:45:03 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(34): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 34, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(47): Model_Comics->getPrevComicUrl('2031-12-10 06:3...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:34
2014-06-08 18:45:23 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 34 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:34
2014-06-08 18:45:23 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(34): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 34, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(47): Model_Comics->getPrevComicUrl('2031-12-10 06:3...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:34
2014-06-08 18:45:23 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 34 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:34
2014-06-08 18:45:23 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(34): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 34, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(47): Model_Comics->getPrevComicUrl('2031-12-10 06:3...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:34
2014-06-08 18:45:35 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 35 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:35
2014-06-08 18:45:35 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(35): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 35, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(47): Model_Comics->getPrevComicUrl('2031-12-10 06:3...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:35
2014-06-08 18:45:46 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 35 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:35
2014-06-08 18:45:46 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(35): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 35, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(47): Model_Comics->getPrevComicUrl('2031-12-10 06:3...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:35
2014-06-08 18:47:14 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 26 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:26
2014-06-08 18:47:14 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(26): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 26, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(46): Model_Comics->getNextComicUrl('0000-00-00 00:0...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:26
2014-06-08 18:47:22 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 26 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:26
2014-06-08 18:47:22 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(26): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 26, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(46): Model_Comics->getNextComicUrl('0000-00-00 00:0...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:26
2014-06-08 20:07:30 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: first_url ~ APPPATH/views/Main.php [ 7 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:7
2014-06-08 20:07:30 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(7): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 7, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:7
2014-06-08 20:12:49 --- EMERGENCY: ErrorException [ 2 ]: Missing argument 1 for Model_Comics::getLatestComicUrl(), called in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php on line 48 and defined ~ APPPATH/classes/Model/Comics.php [ 46 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:46
2014-06-08 20:12:49 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(46): Kohana_Core::error_handler(2, 'Missing argumen...', '/Applications/M...', 46, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(48): Model_Comics->getLatestComicUrl()
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:46
2014-06-08 20:13:03 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: prev_url ~ APPPATH/views/Comic.php [ 12 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Comic.php:12
2014-06-08 20:13:03 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Comic.php(12): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 12, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Comic.php:12
2014-06-08 20:13:27 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: prev_url ~ APPPATH/views/Comic.php [ 12 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Comic.php:12
2014-06-08 20:13:27 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Comic.php(12): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 12, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Comic.php:12
2014-06-08 20:14:06 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 34 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:34
2014-06-08 20:14:06 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(34): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 34, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(47): Model_Comics->getPrevComicUrl('2031-12-10 06:3...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:34
2014-06-08 20:14:23 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 26 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:26
2014-06-08 20:14:23 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(26): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 26, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(46): Model_Comics->getNextComicUrl('0000-00-00 00:0...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:26
2014-06-08 20:16:00 --- EMERGENCY: ErrorException [ 2 ]: Cannot use a scalar value as an array ~ APPPATH/classes/Controller/Comics.php [ 62 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:62
2014-06-08 20:16:00 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(62): Kohana_Core::error_handler(2, 'Cannot use a sc...', '/Applications/M...', 62, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#2 [internal function]: Kohana_Controller->execute()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#6 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#7 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:62
2014-06-08 20:19:10 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 26 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:26
2014-06-08 20:19:10 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(26): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 26, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(46): Model_Comics->getNextComicUrl('0000-00-00 00:0...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:26
2014-06-08 20:20:18 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 64 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:20:18 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(64): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 64, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(43): Model_Comics->getComicBySLug('0')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:20:22 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 64 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:20:22 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(64): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 64, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(43): Model_Comics->getComicBySLug('0')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:37:40 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 64 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:37:40 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(64): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 64, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(43): Model_Comics->getComicBySlug(NULL)
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:38:00 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic ~ APPPATH/classes/Controller/Comics.php [ 20 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:20
2014-06-08 20:38:00 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(20): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 20, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#2 [internal function]: Kohana_Controller->execute()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#6 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#7 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:20
2014-06-08 20:38:02 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: comic ~ APPPATH/classes/Controller/Comics.php [ 20 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:20
2014-06-08 20:38:02 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(20): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 20, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#2 [internal function]: Kohana_Controller->execute()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#6 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#7 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:20
2014-06-08 20:38:35 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 64 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:38:35 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(64): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 64, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(45): Model_Comics->getComicBySlug(NULL)
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:38:48 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 64 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:38:48 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(64): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 64, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(45): Model_Comics->getComicBySlug(NULL)
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:39:17 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 64 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:39:17 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(64): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 64, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(46): Model_Comics->getComicBySlug(NULL)
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:39:30 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 64 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:39:30 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(64): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 64, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(46): Model_Comics->getComicBySlug(NULL)
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:39:58 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 64 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:39:58 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(64): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 64, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(46): Model_Comics->getComicBySlug(NULL)
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:40:52 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 64 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:40:52 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(64): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 64, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(46): Model_Comics->getComicBySlug(NULL)
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:42:11 --- EMERGENCY: ErrorException [ 8 ]: Array to string conversion ~ APPPATH/views/Main.php [ 17 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:17
2014-06-08 20:42:11 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(17): Kohana_Core::error_handler(8, 'Array to string...', '/Applications/M...', 17, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:17
2014-06-08 20:42:59 --- EMERGENCY: ErrorException [ 8 ]: Array to string conversion ~ APPPATH/classes/Controller/Comics.php [ 21 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:21
2014-06-08 20:42:59 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(21): Kohana_Core::error_handler(8, 'Array to string...', '/Applications/M...', 21, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#2 [internal function]: Kohana_Controller->execute()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#6 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#7 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:21
2014-06-08 20:44:01 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 64 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:44:01 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(64): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 64, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(48): Model_Comics->getComicBySlug(NULL)
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:44:20 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 64 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:44:20 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(64): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 64, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(50): Model_Comics->getComicBySlug(NULL)
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:44:43 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 64 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:44:43 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(64): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 64, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(50): Model_Comics->getComicBySlug(NULL)
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 20:51:12 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: firstUrl ~ APPPATH/views/Main.php [ 27 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:27
2014-06-08 20:51:12 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php(27): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 27, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(228): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(19): Kohana_View->__toString()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#8 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(42): Kohana_Controller_Template->after()
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#10 [internal function]: Kohana_Controller->execute()
#11 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#12 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#13 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#14 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#15 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/Main.php:27
2014-06-08 23:56:09 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: script ~ APPPATH/views/template.php [ 24 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:24
2014-06-08 23:56:09 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(24): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 24, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(48): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:24
2014-06-08 23:56:28 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 64 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64
2014-06-08 23:56:28 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(64): Kohana_Core::error_handler(8, 'Undefined offse...', '/Applications/M...', 64, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(52): Model_Comics->getComicBySlug('undefined')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_archive()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:64