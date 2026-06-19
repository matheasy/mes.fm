<?php defined('SYSPATH') OR die('No direct script access.'); ?>

2019-09-27 06:21:24 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php:66
2019-09-27 06:21:24 --- DEBUG: #0 /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/mesfm/pub...', 66, Array)
#1 /home/mesfm/public_html/partner_sites/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/mesfm/public_html/partner_sites/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php:66
2019-09-27 07:15:13 --- EMERGENCY: Database_Exception [ 2 ]: mysql_connect(): Can't connect to MySQL server on '23.229.186.102' (111) ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /home/mesfm/public_html/partner_sites/ccc/modules/database/classes/Kohana/Database/MySQL.php:431
2019-09-27 07:15:13 --- DEBUG: #0 /home/mesfm/public_html/partner_sites/ccc/modules/database/classes/Kohana/Database/MySQL.php(431): Kohana_Database_MySQL->connect()
#1 /home/mesfm/public_html/partner_sites/ccc/modules/database/classes/Kohana/Database.php(478): Kohana_Database_MySQL->escape('harry-potter-ra...')
#2 /home/mesfm/public_html/partner_sites/ccc/modules/database/classes/Kohana/Database/Query/Builder.php(116): Kohana_Database->quote('harry-potter-ra...')
#3 /home/mesfm/public_html/partner_sites/ccc/modules/database/classes/Kohana/Database/Query/Builder/Select.php(372): Kohana_Database_Query_Builder->_compile_conditions(Object(Database_MySQL), Array)
#4 /home/mesfm/public_html/partner_sites/ccc/modules/database/classes/Kohana/Database/Query.php(234): Kohana_Database_Query_Builder_Select->compile(Object(Database_MySQL))
#5 /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php(65): Kohana_Database_Query->execute()
#6 /home/mesfm/public_html/partner_sites/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('harry-potter-ra...')
#7 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#8 [internal function]: Kohana_Controller->execute()
#9 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#10 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#11 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#12 /home/mesfm/public_html/partner_sites/ccc/index.php(118): Kohana_Request->execute()
#13 {main} in /home/mesfm/public_html/partner_sites/ccc/modules/database/classes/Kohana/Database/MySQL.php:431
2019-09-27 10:22:47 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php:66
2019-09-27 10:22:47 --- DEBUG: #0 /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/mesfm/pub...', 66, Array)
#1 /home/mesfm/public_html/partner_sites/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('wp-admin')
#2 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/mesfm/public_html/partner_sites/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php:66
2019-09-27 13:16:42 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php:66
2019-09-27 13:16:42 --- DEBUG: #0 /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/mesfm/pub...', 66, Array)
#1 /home/mesfm/public_html/partner_sites/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('wp-admin')
#2 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/mesfm/public_html/partner_sites/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php:66
2019-09-27 22:11:24 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php:66
2019-09-27 22:11:24 --- DEBUG: #0 /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/mesfm/pub...', 66, Array)
#1 /home/mesfm/public_html/partner_sites/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/mesfm/public_html/partner_sites/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php:66