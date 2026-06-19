<?php defined('SYSPATH') OR die('No direct script access.'); ?>

2019-12-31 06:03:12 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php:66
2019-12-31 06:03:12 --- DEBUG: #0 /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/mesfm/pub...', 66, Array)
#1 /home/mesfm/public_html/partner_sites/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/mesfm/public_html/partner_sites/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php:66
2019-12-31 06:51:58 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php:66
2019-12-31 06:51:58 --- DEBUG: #0 /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/mesfm/pub...', 66, Array)
#1 /home/mesfm/public_html/partner_sites/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('the-real-nyan-c...')
#2 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/mesfm/public_html/partner_sites/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php:66
2019-12-31 06:51:58 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php:66
2019-12-31 06:51:58 --- DEBUG: #0 /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/mesfm/pub...', 66, Array)
#1 /home/mesfm/public_html/partner_sites/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('the-real-nyan-c...')
#2 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/mesfm/public_html/partner_sites/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php:66
2019-12-31 08:43:53 --- EMERGENCY: Database_Exception [ 2 ]: mysql_connect(): Can't connect to MySQL server on '23.229.186.102' (111) ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /home/mesfm/public_html/partner_sites/ccc/modules/database/classes/Kohana/Database/MySQL.php:431
2019-12-31 08:43:53 --- DEBUG: #0 /home/mesfm/public_html/partner_sites/ccc/modules/database/classes/Kohana/Database/MySQL.php(431): Kohana_Database_MySQL->connect()
#1 /home/mesfm/public_html/partner_sites/ccc/modules/database/classes/Kohana/Database.php(478): Kohana_Database_MySQL->escape('wong-neighbourh...')
#2 /home/mesfm/public_html/partner_sites/ccc/modules/database/classes/Kohana/Database/Query/Builder.php(116): Kohana_Database->quote('wong-neighbourh...')
#3 /home/mesfm/public_html/partner_sites/ccc/modules/database/classes/Kohana/Database/Query/Builder/Select.php(372): Kohana_Database_Query_Builder->_compile_conditions(Object(Database_MySQL), Array)
#4 /home/mesfm/public_html/partner_sites/ccc/modules/database/classes/Kohana/Database/Query.php(234): Kohana_Database_Query_Builder_Select->compile(Object(Database_MySQL))
#5 /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php(65): Kohana_Database_Query->execute()
#6 /home/mesfm/public_html/partner_sites/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('wong-neighbourh...')
#7 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#8 [internal function]: Kohana_Controller->execute()
#9 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#10 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#11 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#12 /home/mesfm/public_html/partner_sites/ccc/index.php(118): Kohana_Request->execute()
#13 {main} in /home/mesfm/public_html/partner_sites/ccc/modules/database/classes/Kohana/Database/MySQL.php:431
2019-12-31 12:52:27 --- EMERGENCY: Database_Exception [ 2 ]: mysql_connect(): Can't connect to MySQL server on '23.229.186.102' (111) ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /home/mesfm/public_html/partner_sites/ccc/modules/database/classes/Kohana/Database/MySQL.php:171
2019-12-31 12:52:27 --- DEBUG: #0 /home/mesfm/public_html/partner_sites/ccc/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /home/mesfm/public_html/partner_sites/ccc/modules/database/classes/Kohana/Database/Query.php(251): Kohana_Database_MySQL->query(1, 'SELECT * FROM `...', false, Array)
#2 /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php(11): Kohana_Database_Query->execute()
#3 /home/mesfm/public_html/partner_sites/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getLatestComic()
#4 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#5 [internal function]: Kohana_Controller->execute()
#6 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#7 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#8 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#9 /home/mesfm/public_html/partner_sites/ccc/index.php(118): Kohana_Request->execute()
#10 {main} in /home/mesfm/public_html/partner_sites/ccc/modules/database/classes/Kohana/Database/MySQL.php:171
2019-12-31 17:03:11 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php:66
2019-12-31 17:03:11 --- DEBUG: #0 /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/mesfm/pub...', 66, Array)
#1 /home/mesfm/public_html/partner_sites/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/mesfm/public_html/partner_sites/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php:66
2019-12-31 22:26:08 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php:66
2019-12-31 22:26:08 --- DEBUG: #0 /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/mesfm/pub...', 66, Array)
#1 /home/mesfm/public_html/partner_sites/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/mesfm/public_html/partner_sites/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php:66