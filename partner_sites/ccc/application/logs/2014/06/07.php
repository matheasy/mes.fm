<?php defined('SYSPATH') OR die('No direct script access.'); ?>

2014-06-07 05:35:01 --- EMERGENCY: ErrorException [ 8 ]: Undefined property: Request::$response ~ APPPATH/classes/Controller/Comics.php [ 13 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:13
2014-06-07 05:35:01 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(13): Kohana_Core::error_handler(8, 'Undefined prope...', '/Applications/M...', 13, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#2 [internal function]: Kohana_Controller->execute()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#6 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#7 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php:13
2014-06-07 05:36:34 --- EMERGENCY: ErrorException [ 1 ]: Class 'Template_Controller' not found ~ APPPATH/classes/Controller/Comics.php [ 3 ] in file:line
2014-06-07 05:36:34 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 14:10:15 --- EMERGENCY: ErrorException [ 1 ]: Class 'Template_Controller' not found ~ APPPATH/classes/Controller/Comics.php [ 3 ] in file:line
2014-06-07 14:10:15 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 14:12:01 --- EMERGENCY: View_Exception [ 0 ]: The requested view template could not be found ~ SYSPATH/classes/Kohana/View.php [ 257 ] in /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php:137
2014-06-07 14:12:01 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(137): Kohana_View->set_filename('template')
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(30): Kohana_View->__construct('template', NULL)
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(33): Kohana_View::factory('template')
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(69): Kohana_Controller_Template->before()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php:137
2014-06-07 14:15:40 --- EMERGENCY: ErrorException [ 1 ]: Class 'Controller_Base' not found ~ APPPATH/classes/Controller/Comics.php [ 3 ] in file:line
2014-06-07 14:15:40 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 14:15:53 --- EMERGENCY: ErrorException [ 1 ]: Class 'Controller_Base' not found ~ APPPATH/classes/Controller/Comics.php [ 3 ] in file:line
2014-06-07 14:15:53 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 14:15:54 --- EMERGENCY: ErrorException [ 1 ]: Class 'Controller_Base' not found ~ APPPATH/classes/Controller/Comics.php [ 3 ] in file:line
2014-06-07 14:15:54 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 14:16:05 --- EMERGENCY: ErrorException [ 1 ]: Class 'Controller_Base' not found ~ APPPATH/classes/Controller/Comics.php [ 3 ] in file:line
2014-06-07 14:16:05 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 14:16:23 --- EMERGENCY: View_Exception [ 0 ]: The requested view template could not be found ~ SYSPATH/classes/Kohana/View.php [ 257 ] in /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php:137
2014-06-07 14:16:23 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(137): Kohana_View->set_filename('template')
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(30): Kohana_View->__construct('template', NULL)
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(33): Kohana_View::factory('template')
#3 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(7): Kohana_Controller_Template->before()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(69): Controller_Base->before()
#5 [internal function]: Kohana_Controller->execute()
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#9 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#10 {main} in /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php:137
2014-06-07 14:19:32 --- EMERGENCY: ErrorException [ 4 ]: syntax error, unexpected 'public' (T_PUBLIC) ~ APPPATH/classes/Controller/Comics.php [ 8 ] in file:line
2014-06-07 14:19:32 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 14:19:59 --- EMERGENCY: ErrorException [ 4 ]: syntax error, unexpected 'public' (T_PUBLIC) ~ APPPATH/classes/Controller/Comics.php [ 8 ] in file:line
2014-06-07 14:19:59 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 14:34:35 --- EMERGENCY: ErrorException [ 1 ]: Call to undefined function GDN__construct() ~ APPPATH/classes/Controller/Base.php [ 6 ] in file:line
2014-06-07 14:34:35 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 14:34:45 --- EMERGENCY: ErrorException [ 2 ]: Attempt to assign property of non-object ~ APPPATH/classes/Controller/Base.php [ 7 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php:7
2014-06-07 14:34:45 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(7): Kohana_Core::error_handler(2, 'Attempt to assi...', '/Applications/M...', 7, Array)
#1 [internal function]: Controller_Base->__construct(Object(Request), Object(Response))
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(94): ReflectionClass->newInstance(Object(Request), Object(Response))
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#5 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#6 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php:7
2014-06-07 14:41:08 --- EMERGENCY: ErrorException [ 4 ]: syntax error, unexpected '->' (T_OBJECT_OPERATOR) ~ APPPATH/classes/Controller/Comics.php [ 9 ] in file:line
2014-06-07 14:41:08 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 14:41:23 --- EMERGENCY: ErrorException [ 4 ]: syntax error, unexpected '->' (T_OBJECT_OPERATOR) ~ APPPATH/classes/Controller/Comics.php [ 9 ] in file:line
2014-06-07 14:41:23 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 14:41:54 --- EMERGENCY: ErrorException [ 4 ]: syntax error, unexpected '->' (T_OBJECT_OPERATOR) ~ APPPATH/classes/Controller/Comics.php [ 10 ] in file:line
2014-06-07 14:41:54 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 14:46:36 --- EMERGENCY: ErrorException [ 4 ]: syntax error, unexpected '->' (T_OBJECT_OPERATOR) ~ APPPATH/classes/Controller/Comics.php [ 10 ] in file:line
2014-06-07 14:46:36 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 15:35:58 --- EMERGENCY: ErrorException [ 8 ]: Array to string conversion ~ APPPATH/views/template.php [ 4 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:4
2014-06-07 15:35:58 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(4): Kohana_Core::error_handler(8, 'Array to string...', '/Applications/M...', 4, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(25): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:4
2014-06-07 15:36:41 --- EMERGENCY: ErrorException [ 8 ]: Array to string conversion ~ APPPATH/views/template.php [ 4 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:4
2014-06-07 15:36:41 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(4): Kohana_Core::error_handler(8, 'Array to string...', '/Applications/M...', 4, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(25): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:4
2014-06-07 15:36:42 --- EMERGENCY: ErrorException [ 8 ]: Array to string conversion ~ APPPATH/views/template.php [ 4 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:4
2014-06-07 15:36:42 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(4): Kohana_Core::error_handler(8, 'Array to string...', '/Applications/M...', 4, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(25): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:4
2014-06-07 15:37:02 --- EMERGENCY: ErrorException [ 8 ]: Use of undefined constant styles - assumed 'styles' ~ APPPATH/classes/Controller/Base.php [ 34 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php:34
2014-06-07 15:37:02 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(34): Kohana_Core::error_handler(8, 'Use of undefine...', '/Applications/M...', 34, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#2 [internal function]: Kohana_Controller->execute()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#6 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#7 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php:34
2014-06-07 15:37:26 --- EMERGENCY: ErrorException [ 8 ]: Use of undefined constant styles - assumed 'styles' ~ APPPATH/classes/Controller/Base.php [ 34 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php:34
2014-06-07 15:37:26 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(34): Kohana_Core::error_handler(8, 'Use of undefine...', '/Applications/M...', 34, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#2 [internal function]: Kohana_Controller->execute()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#6 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#7 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php:34
2014-06-07 15:37:54 --- EMERGENCY: ErrorException [ 8 ]: Array to string conversion ~ APPPATH/classes/Controller/Base.php [ 34 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php:34
2014-06-07 15:37:54 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(34): Kohana_Core::error_handler(8, 'Array to string...', '/Applications/M...', 34, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#2 [internal function]: Kohana_Controller->execute()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#6 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#7 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php:34
2014-06-07 15:38:14 --- EMERGENCY: ErrorException [ 8 ]: Array to string conversion ~ APPPATH/classes/Controller/Base.php [ 34 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php:34
2014-06-07 15:38:14 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(34): Kohana_Core::error_handler(8, 'Array to string...', '/Applications/M...', 34, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#2 [internal function]: Kohana_Controller->execute()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#6 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#7 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php:34
2014-06-07 15:40:03 --- EMERGENCY: ErrorException [ 8 ]: Array to string conversion ~ APPPATH/views/template.php [ 4 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:4
2014-06-07 15:40:03 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(4): Kohana_Core::error_handler(8, 'Array to string...', '/Applications/M...', 4, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(35): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:4
2014-06-07 15:41:09 --- EMERGENCY: ErrorException [ 4 ]: syntax error, unexpected 'endforeach' (T_ENDFOREACH) ~ APPPATH/views/template.php [ 6 ] in file:line
2014-06-07 15:41:09 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 15:41:30 --- EMERGENCY: ErrorException [ 4 ]: syntax error, unexpected 'endforeach' (T_ENDFOREACH) ~ APPPATH/views/template.php [ 6 ] in file:line
2014-06-07 15:41:30 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 15:43:16 --- EMERGENCY: ErrorException [ 4 ]: syntax error, unexpected 'endforeach' (T_ENDFOREACH) ~ APPPATH/views/template.php [ 6 ] in file:line
2014-06-07 15:43:16 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 15:43:51 --- EMERGENCY: ErrorException [ 4 ]: syntax error, unexpected 'endforeach' (T_ENDFOREACH) ~ APPPATH/views/template.php [ 6 ] in file:line
2014-06-07 15:43:51 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 15:43:52 --- EMERGENCY: ErrorException [ 4 ]: syntax error, unexpected 'endforeach' (T_ENDFOREACH) ~ APPPATH/views/template.php [ 6 ] in file:line
2014-06-07 15:43:52 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 15:43:53 --- EMERGENCY: ErrorException [ 4 ]: syntax error, unexpected 'endforeach' (T_ENDFOREACH) ~ APPPATH/views/template.php [ 6 ] in file:line
2014-06-07 15:43:53 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 15:45:49 --- EMERGENCY: ErrorException [ 8 ]: Undefined variable: key ~ APPPATH/views/template.php [ 6 ] in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:6
2014-06-07 15:45:49 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php(6): Kohana_Core::error_handler(8, 'Undefined varia...', '/Applications/M...', 6, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(61): include('/Applications/M...')
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/View.php(348): Kohana_View::capture('/Applications/M...', Array)
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller/Template.php(44): Kohana_View->render()
#4 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Base.php(35): Kohana_Controller_Template->after()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(87): Controller_Base->after()
#6 [internal function]: Kohana_Controller->execute()
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#9 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#10 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#11 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/views/template.php:6
2014-06-07 16:54:51 --- EMERGENCY: ErrorException [ 1 ]: Class 'Model_Comics' not found ~ APPPATH/classes/Controller/Comics.php [ 9 ] in file:line
2014-06-07 16:54:51 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 16:55:09 --- EMERGENCY: ErrorException [ 1 ]: Class 'Model_Comics' not found ~ APPPATH/classes/Controller/Comics.php [ 9 ] in file:line
2014-06-07 16:55:09 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 16:55:10 --- EMERGENCY: ErrorException [ 1 ]: Class 'Model_Comics' not found ~ APPPATH/classes/Controller/Comics.php [ 9 ] in file:line
2014-06-07 16:55:10 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 16:55:11 --- EMERGENCY: ErrorException [ 1 ]: Class 'Model_Comics' not found ~ APPPATH/classes/Controller/Comics.php [ 9 ] in file:line
2014-06-07 16:55:11 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 16:55:11 --- EMERGENCY: ErrorException [ 1 ]: Class 'Model_Comics' not found ~ APPPATH/classes/Controller/Comics.php [ 9 ] in file:line
2014-06-07 16:55:11 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 16:56:16 --- EMERGENCY: ErrorException [ 1 ]: Class 'Model_Comics' not found ~ APPPATH/classes/Controller/Comics.php [ 9 ] in file:line
2014-06-07 16:56:16 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 16:56:52 --- EMERGENCY: ErrorException [ 1 ]: Class 'Model_Comics' not found ~ APPPATH/classes/Controller/Comics.php [ 9 ] in file:line
2014-06-07 16:56:52 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 16:56:52 --- EMERGENCY: ErrorException [ 1 ]: Class 'Model_Comics' not found ~ APPPATH/classes/Controller/Comics.php [ 9 ] in file:line
2014-06-07 16:56:52 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 16:56:52 --- EMERGENCY: ErrorException [ 1 ]: Class 'Model_Comics' not found ~ APPPATH/classes/Controller/Comics.php [ 9 ] in file:line
2014-06-07 16:56:52 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 17:01:53 --- EMERGENCY: ErrorException [ 1 ]: Class 'Model_Comics' not found ~ SYSPATH/classes/Kohana/Model.php [ 26 ] in file:line
2014-06-07 17:01:53 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 17:02:11 --- EMERGENCY: ErrorException [ 1 ]: Class 'Model_Comics' not found ~ SYSPATH/classes/Kohana/Model.php [ 26 ] in file:line
2014-06-07 17:02:11 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 17:02:12 --- EMERGENCY: ErrorException [ 1 ]: Class 'Model_Comics' not found ~ SYSPATH/classes/Kohana/Model.php [ 26 ] in file:line
2014-06-07 17:02:12 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 17:02:19 --- EMERGENCY: ErrorException [ 1 ]: Class 'Model_Comics' not found ~ SYSPATH/classes/Kohana/Model.php [ 26 ] in file:line
2014-06-07 17:02:19 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 17:02:25 --- EMERGENCY: ErrorException [ 1 ]: Class 'Model_Comics' not found ~ APPPATH/classes/Controller/Comics.php [ 9 ] in file:line
2014-06-07 17:02:25 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 17:02:36 --- EMERGENCY: ErrorException [ 1 ]: Call to undefined function Model() ~ APPPATH/classes/Controller/Comics.php [ 9 ] in file:line
2014-06-07 17:02:36 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 17:02:38 --- EMERGENCY: ErrorException [ 1 ]: Call to undefined function Model() ~ APPPATH/classes/Controller/Comics.php [ 9 ] in file:line
2014-06-07 17:02:38 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 17:04:23 --- EMERGENCY: ErrorException [ 1 ]: Class 'Model_Comics' not found ~ APPPATH/classes/Controller/Comics.php [ 9 ] in file:line
2014-06-07 17:04:23 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 17:05:27 --- EMERGENCY: ErrorException [ 8 ]: Undefined property: Model_Comics::$db ~ APPPATH/classes/Model/Comics.php [ 7 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:7
2014-06-07 17:05:27 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Core::error_handler(8, 'Undefined prope...', '/Applications/M...', 7, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:7
2014-06-07 17:05:45 --- EMERGENCY: ErrorException [ 4 ]: syntax error, unexpected 'db' (T_STRING), expecting variable (T_VARIABLE) ~ APPPATH/classes/Model/Comics.php [ 4 ] in file:line
2014-06-07 17:05:45 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 17:07:28 --- EMERGENCY: ErrorException [ 1 ]: Access to undeclared static property: Model_Comics::$_TABLE_PREFIX ~ APPPATH/classes/Model/Comics.php [ 7 ] in file:line
2014-06-07 17:07:28 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 17:08:15 --- EMERGENCY: ErrorException [ 2 ]: Missing argument 2 for Kohana_DB::query(), called in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php on line 7 and defined ~ MODPATH/database/classes/Kohana/DB.php [ 42 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/DB.php:42
2014-06-07 17:08:15 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/DB.php(42): Kohana_Core::error_handler(2, 'Missing argumen...', '/Applications/M...', 42, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_DB::query('Select * from c...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/DB.php:42
2014-06-07 17:08:41 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-07 17:08:41 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/Query.php(251): Kohana_Database_MySQL->query(1, '* from comics', false, Array)
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(8): Kohana_Database_Query->execute()
#3 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#5 [internal function]: Kohana_Controller->execute()
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#9 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#10 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-07 17:26:31 --- EMERGENCY: Kohana_Exception [ 0 ]: Attempted to load an invalid or missing module 'mysqli' at 'MODPATH/mysqli' ~ SYSPATH/classes/Kohana/Core.php [ 579 ] in /Applications/MAMP/htdocs/chinchatcomics/application/bootstrap.php:135
2014-06-07 17:26:31 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/bootstrap.php(135): Kohana_Core::modules(Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/index.php(102): require('/Applications/M...')
#2 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/bootstrap.php:135
2014-06-07 17:33:55 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-07 17:33:55 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/Query.php(251): Kohana_Database_MySQL->query(1, '* from comics', false, Array)
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(8): Kohana_Database_Query->execute()
#3 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#5 [internal function]: Kohana_Controller->execute()
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#8 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#9 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#10 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-07 17:36:37 --- EMERGENCY: ErrorException [ 1 ]: Class 'DB' not found ~ APPPATH/classes/Model/Comics.php [ 7 ] in file:line
2014-06-07 17:36:37 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 17:37:34 --- EMERGENCY: ErrorException [ 1 ]: Class 'Database' not found ~ MODPATH/mysqli/classes/Kohana/Database/MySQLi.php [ 10 ] in file:line
2014-06-07 17:37:34 --- DEBUG: #0 [internal function]: Kohana_Core::shutdown_handler()
#1 {main} in file:line
2014-06-07 17:38:10 --- EMERGENCY: ErrorException [ 2048 ]: Non-static method Kohana_Database_MySQLi::query() should not be called statically, assuming $this from incompatible context ~ APPPATH/classes/Model/Comics.php [ 7 ] in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:7
2014-06-07 17:38:10 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Core::error_handler(2048, 'Non-static meth...', '/Applications/M...', 7, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#2 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#3 [internal function]: Kohana_Controller->execute()
#4 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#7 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#8 {main} in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php:7
2014-06-07 17:40:02 --- EMERGENCY: ErrorException [ 2 ]: Missing argument 1 for Kohana_Database::__construct(), called in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php on line 7 and defined ~ MODPATH/database/classes/Kohana/Database.php [ 111 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database.php:111
2014-06-07 17:40:02 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database.php(111): Kohana_Core::error_handler(2, 'Missing argumen...', '/Applications/M...', 111, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database->__construct()
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database.php:111
2014-06-07 17:44:19 --- EMERGENCY: ErrorException [ 2 ]: Missing argument 2 for Kohana_Database_MySQL::query(), called in /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php on line 7 and defined ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 168 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:168
2014-06-07 17:44:19 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(168): Kohana_Core::error_handler(2, 'Missing argumen...', '/Applications/M...', 168, Array)
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:168
2014-06-07 17:44:34 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-07 17:44:34 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-07 17:45:49 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-07 17:45:49 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-07 17:45:50 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-07 17:45:50 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-07 17:45:51 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-07 17:45:51 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-07 17:45:51 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-07 17:45:51 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-07 18:31:34 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-07 18:31:34 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-07 18:31:35 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-07 18:31:35 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-07 18:31:36 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-07 18:31:36 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-07 18:31:36 --- EMERGENCY: Database_Exception [ 8192 ]: mysql_connect(): The mysql extension is deprecated and will be removed in the future: use mysqli or PDO instead ~ MODPATH/database/classes/Kohana/Database/MySQL.php [ 67 ] in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171
2014-06-07 18:31:36 --- DEBUG: #0 /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php(171): Kohana_Database_MySQL->connect()
#1 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Model/Comics.php(7): Kohana_Database_MySQL->query('SELECT', 'SELECT * FROM "...')
#2 /Applications/MAMP/htdocs/chinchatcomics/application/classes/Controller/Comics.php(10): Model_Comics->getLatestComic()
#3 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Controller.php(84): Controller_Comics->action_index()
#4 [internal function]: Kohana_Controller->execute()
#5 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client/Internal.php(97): ReflectionMethod->invoke(Object(Controller_Comics))
#6 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request/Client.php(114): Kohana_Request_Client_Internal->execute_request(Object(Request), Object(Response))
#7 /Applications/MAMP/htdocs/chinchatcomics/system/classes/Kohana/Request.php(986): Kohana_Request_Client->execute(Object(Request))
#8 /Applications/MAMP/htdocs/chinchatcomics/index.php(118): Kohana_Request->execute()
#9 {main} in /Applications/MAMP/htdocs/chinchatcomics/modules/database/classes/Kohana/Database/MySQL.php:171