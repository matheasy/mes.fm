<?php defined('SYSPATH') OR die('No direct script access.'); ?>

2020-02-01 01:26:49 --- EMERGENCY: Database_Exception [ 2 ]: mysql_connect(): Host 'ip-23-229-186-102.ip.secureserver.net' is not allowed to connect to this MySQL server ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /home/mesfm/public_html/partner_sites/ccc/modules/database/classes/Kohana/Database/MySQL.php:171
2020-02-01 01:26:49 --- DEBUG: #0 /home/mesfm/public_html/partner_sites/ccc/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
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
2020-02-01 06:51:14 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php:66
2020-02-01 06:51:14 --- DEBUG: #0 /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/mesfm/pub...', 66, Array)
#1 /home/mesfm/public_html/partner_sites/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/mesfm/public_html/partner_sites/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php:66
2020-02-01 21:56:10 --- EMERGENCY: ErrorException [ 8 ]: Undefined offset: 0 ~ APPPATH/classes/Model/Comics.php [ 66 ] in /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php:66
2020-02-01 21:56:10 --- DEBUG: #0 /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php(66): Kohana_Core::error_handler(8, 'Undefined offse...', '/home/mesfm/pub...', 66, Array)
#1 /home/mesfm/public_html/partner_sites/ccc/application/classes/Controller/Comics.php(13): Model_Comics->getComicBySlug('feed')
#2 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Controller.php(69): Controller_Comics->before()
#3 [internal function]: Kohana_Controller->execute()
#4 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /home/mesfm/public_html/partner_sites/ccc/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /home/mesfm/public_html/partner_sites/ccc/index.php(118): Kohana_Request->execute()
#8 {main} in /home/mesfm/public_html/partner_sites/ccc/application/classes/Model/Comics.php:66