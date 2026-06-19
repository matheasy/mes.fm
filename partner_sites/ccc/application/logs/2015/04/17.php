<?php defined('SYSPATH') OR die('No direct script access.'); ?>

2015-04-17 01:01:31 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 01:01:31 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('privacy-policy')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 02:04:34 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 02:04:34 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 03:30:03 --- EMERGENCY: Database_Exception [ 2 ]: mysql_connect(): Can't connect to MySQL server on 'chinchatcomics.db.6297265.hostedresource.com' (111) ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /home/content/65/6297265/html/partners/ccc/modules/database/classes/Kohana/Database/MySQL.php:431
2015-04-17 03:30:03 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/modules/database/classes/Kohana/Database/MySQL.php(431): Kohana_Database_MySQL->connect()
#1 /home/content/65/6297265/html/partners/ccc/modules/database/classes/Kohana/Database.php(478): Kohana_Database_MySQL->escape('caption-contest...')
#2 /home/content/65/6297265/html/partners/ccc/modules/database/classes/Kohana/Database/Query/Builder.php(116): Kohana_Database->quote('caption-contest...')
#3 /home/content/65/6297265/html/partners/ccc/modules/database/classes/Kohana/Database/Query/Builder/Select.php(372): Kohana_Database_Query_Builder->_compile_conditions(Object(Database_MySQL), Array)
#4 /home/content/65/6297265/html/partners/ccc/modules/database/classes/Kohana/Database/Query.php(234): Kohana_Database_Query_Builder_Select->compile(Object(Database_MySQL))
#5 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(65): Kohana_Database_Query->execute()
#6 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('caption-contest...')
#7 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#8 [internal function]: Kohana_Controller->execute()
#9 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#10 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#11 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#12 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#13 {main} in /home/content/65/6297265/html/partners/ccc/modules/database/classes/Kohana/Database/MySQL.php:431
2015-04-17 04:21:05 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 04:21:05 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('stylin-llamas')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 05:41:49 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 05:41:49 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 07:06:01 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 07:06:01 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 07:51:27 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 07:51:27 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 08:46:41 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 08:46:41 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('people-at-the-g...')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 08:57:31 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 08:57:31 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('midterm-madness')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 11:59:57 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 11:59:57 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:45:17 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:45:17 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('chinchilla-foru...')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:45:32 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:45:32 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('chinchilla-foru...')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:45:46 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:45:46 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('chinchilla-foru...')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:46:32 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:46:32 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('chinchilla-foru...')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:47:06 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:47:06 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('chinchilla-foru...')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:47:20 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:47:20 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('chinchilla-foru...')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:47:50 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:47:50 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('chinchilla-foru...')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:48:42 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:48:42 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('chinchilla-foru...')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:48:50 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:48:50 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('chinchilla-foru...')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:50:17 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:50:17 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('chinchilla-foru...')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:50:27 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:50:27 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('chinchilla-foru...')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:50:33 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:50:33 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('chinchilla-foru...')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:50:38 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:50:38 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('chinchilla-foru...')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:50:54 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 12:50:54 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('chinchilla-foru...')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 13:10:21 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 13:10:21 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 13:25:15 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 13:25:15 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('chinchilla-foru...')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 14:47:46 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 14:47:46 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('just-some-new-p...')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 14:47:46 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 14:47:46 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('mini-turtles')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 14:47:46 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 14:47:46 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('turtle-eating-m...')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 14:56:57 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 14:56:57 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 16:18:36 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 16:18:36 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('chinchilla-time...')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 16:51:22 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 16:51:22 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 17:11:55 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 17:11:55 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 18:05:52 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 18:05:52 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('press')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 18:12:09 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 18:12:09 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 18:24:33 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 18:24:33 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 19:05:19 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 19:05:19 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 19:12:52 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 19:12:52 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 19:39:17 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 19:39:17 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('privacy-policy')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 20:12:52 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 20:12:52 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 20:55:54 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 20:55:54 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 21:12:53 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 21:12:53 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 21:59:40 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 21:59:40 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 22:12:51 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 22:12:51 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 22:55:01 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 22:55:01 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('privacy-policy')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 23:51:27 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-04-17 23:51:27 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('chinchilla-foru...')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66