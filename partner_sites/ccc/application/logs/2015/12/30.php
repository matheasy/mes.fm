<?php defined('SYSPATH') OR die('No direct script access.'); ?>

2015-12-30 00:43:20 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 00:43:20 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('fan-goodies')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 01:23:10 --- EMERGENCY: Database_Exception [ 2 ]: mysql_connect(): Can't connect to MySQL server on 'chinchatcomics.db.6297265.hostedresource.com' (4) ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /home/content/65/6297265/html/partners/ccc/modules/database/classes/Kohana/Database/MySQL.php:431
2015-12-30 01:23:10 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/modules/database/classes/Kohana/Database/MySQL.php(431): Kohana_Database_MySQL->connect()
#1 /home/content/65/6297265/html/partners/ccc/modules/database/classes/Kohana/Database.php(478): Kohana_Database_MySQL->escape('ridonkulas')
#2 /home/content/65/6297265/html/partners/ccc/modules/database/classes/Kohana/Database/Query/Builder.php(116): Kohana_Database->quote('ridonkulas')
#3 /home/content/65/6297265/html/partners/ccc/modules/database/classes/Kohana/Database/Query/Builder/Select.php(372): Kohana_Database_Query_Builder->_compile_conditions(Object(Database_MySQL), Array)
#4 /home/content/65/6297265/html/partners/ccc/modules/database/classes/Kohana/Database/Query.php(234): Kohana_Database_Query_Builder_Select->compile(Object(Database_MySQL))
#5 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(65): Kohana_Database_Query->execute()
#6 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('ridonkulas')
#7 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#8 [internal function]: Kohana_Controller->execute()
#9 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#10 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#11 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#12 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#13 {main} in /home/content/65/6297265/html/partners/ccc/modules/database/classes/Kohana/Database/MySQL.php:431
2015-12-30 05:27:35 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 05:27:35 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 06:46:11 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 06:46:11 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 07:34:32 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 07:34:32 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 08:03:24 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 08:03:24 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('a')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 09:04:39 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 09:04:39 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 10:05:32 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 10:05:32 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 11:53:45 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 11:53:45 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 11:54:59 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 11:54:59 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 12:10:29 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 12:10:29 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 13:10:37 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 13:10:37 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 14:10:42 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 14:10:42 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 15:10:57 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 15:10:57 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 16:15:46 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 16:15:46 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 17:15:38 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 17:15:38 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 17:34:42 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 17:34:42 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 17:56:29 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 17:56:29 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 18:15:40 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 18:15:40 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 20:48:59 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 20:48:59 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('?0')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 20:49:21 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 20:49:21 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 21:03:48 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 21:03:48 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 21:33:54 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 21:33:54 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('chinchilla-foru...')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 23:34:52 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66
2015-12-30 23:34:52 --- DEBUG: #0 /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/content/6...', 66, Array)
#1 /home/content/65/6297265/html/partners/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('images')
#2 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/content/65/6297265/html/partners/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/content/65/6297265/html/partners/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/content/65/6297265/html/partners/ccc/application/classes/Model/Comics.php:66