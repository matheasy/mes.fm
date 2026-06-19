<?php

$whitelist = array('127.0.0.1','::1');
$localhost = in_array($_SERVER['REMOTE_ADDR'], $whitelist) ? true : false;
require_once '../../vendor/autoload.php';
require_once '../../main_lib/Mobile_Detect.php';
require_once 'global_variables_extension.php';

if( isset($_GET['mobile']) )
    $mobile = $_GET['mobile'];
else {
    $detect = new Mobile_Detect;
    $mobile = ( $detect->isMobile() && !$detect->isTablet() ) ? true : false;
}

//$uri = $_SERVER['REQUEST_URI'];
$foldersToSearch = array('../../main_templates','templates','../../main_css');
$loader = new Twig_Loader_Filesystem($foldersToSearch);
$twig = new Twig_Environment($loader, array(
    'cache' => 'compilation_cache',
    'auto_reload' => true,
));

$uri = isset($_GET['uri']) ? '/'.rtrim($_GET['uri'], '/') : '/';
$global_variables = new Global_Variables_Extension($localhost,$mobile,$uri);
$twig->addExtension($global_variables);

switch($uri) {
	case '/': //homepage
		echo $twig->render($mobile ? 'calculator_mobile.twig' : 'calculator.twig', array(
			'resp_rect' => false,
			'gplus_author' => 'https://plus.google.com/+FinalExamCalculatorPage',
            'page_title' => 'Final Grade Calculator',
			'page_description' => 'Our Final Exam Grade Calculator calculates what you need on your final exam to get a desired grade in the course. If you have asked yourself "what do I need on my final exam...?" then this site is for you!<br><br>
			Want to calculate your weighted average grade? Then try our <a class="link" href="https://gradecalculator.mes.fm/weighted-average-calculator">Weighted Average Calculator</a>',
            'secondary_page_ads' => 0
		));
		break;
    case '/study-tips': //study tips
        require_once '../../main_lib/memes_lib.php';
        $mes_memes = new MES_Memes('memes_gc');

        $pageNumber = isset($_GET['p']) ? $_GET['p'] : 1;

        $all_data = $mes_memes->all_meme_data($pageNumber,$type=2);
        $data = $all_data[0];
        $num_memes = $all_data[1];

        echo $twig->render('memes_gallery.twig', array(
            'memes_dir' => 'study-tips',
            'subscribe_data_option_2' => 'Study Tips',
            'og_description' => 'Learn how to study effectively with these amazing study tips and techniques!',
            'title' => 'Study Tips',
            'page_title' => $data ? 'Study Tips' : 'No study tips to show here! :(',
            'items_per_row' => $mobile ? 2 : 4,
            'page_description' => 'Learn how to study effectively with these amazing study tips and techniques!',
            'data' => $data,
            'page' => $pageNumber,
            'max_page' => ceil($num_memes/20),
            'current_tab' => '3',
            'secondary_page_ads' => 0
        )); 
        break;
    case strpos($uri, '/study-tips/'): //study tips single page
        require_once '../../main_lib/memes_lib.php';
        $mes_meme = new MES_Memes('memes_gc');

        $url = explode('study-tips/', $uri);
        $url = $url[1];
        $all_data = $mes_meme->single_meme_data($url,$type=2);
        $current_meme = $all_data[0];
        $next_meme = $all_data[1];
        $prev_meme = $all_data[2];
        $rand_meme = $all_data[3];
        if(!$current_meme) {
            header('HTTP/1.0 404 Not Found');
            echo $twig->render('page_not_found.twig', array('title' => 'Page Not Found'));
            exit();
        }

        $twig->addFunction(new Twig_SimpleFunction('img_data', 'get_img_data'));
        echo $twig->render('memes_single.twig', array(
            'memes_dir' => 'study-tips',
            'subscribe_data_option_2' => 'Study Tips',
            'og_description' => $current_meme['description'],
            'og_img_url' => "https://gradecalculator.mes.fm/img/memes/".$current_meme['imgurl'],
            'title' => $current_meme['title'].' | Study Tips',
            'page_title' => $current_meme['title'],
            'page_description' => $current_meme['description'],
            'img_url' => $current_meme['imgurl'],
            'img_id' => $current_meme['id'],
            'next_meme' => $next_meme,
            'prev_meme' => $prev_meme,
            'rand_meme' => $rand_meme,
            'current_tab' => '3'
        )); 
        break;    
	case '/memes': //memes
		require_once '../../main_lib/memes_lib.php';
		$mes_memes = new MES_Memes('memes_gc');

		$pageNumber = isset($_GET['p']) ? $_GET['p'] : 1;

		$all_data = $mes_memes->all_meme_data($pageNumber,$type=1);
		$data = $all_data[0];
		$num_memes = $all_data[1];

        echo $twig->render('memes_gallery.twig', array(
            'subscribe_data_option_2' => 'Final Exam Memes',
            'og_description' => 'Check out Grade Calculator\'s Memes!',
            'title' => 'Final Exam Memes',
            'page_title' => $data ? 'Final Exam Memes' : 'No memes to show here! :(',
            'items_per_row' => $mobile ? 2 : 4,
            'page_description' => 'The best and funniest final exam memes!',
            'data' => $data,
            'page' => $pageNumber,
            'max_page' => ceil($num_memes/20),
            'current_tab' => '2',
            'secondary_page_ads' => 0
        )); 
		break;
	case strpos($uri, '/memes/'): //memes single page
		require_once '../../main_lib/memes_lib.php';
		$mes_meme = new MES_Memes('memes_gc');

		$url = explode('memes/', $uri);
		$url = $url[1];
		$all_data = $mes_meme->single_meme_data($url,$type=1);
		$current_meme = $all_data[0];
		$next_meme = $all_data[1];
		$prev_meme = $all_data[2];
		$rand_meme = $all_data[3];
		if(!$current_meme) {
            header('HTTP/1.0 404 Not Found');
            echo $twig->render('page_not_found.twig', array('title' => 'Page Not Found'));
            exit();
        }

		$twig->addFunction(new Twig_SimpleFunction('img_data', 'get_img_data'));
        echo $twig->render('memes_single.twig', array(
            'subscribe_data_option_2' => 'Final Exam Memes',
            'og_description' => $current_meme['description'],
            'og_img_url' => "https://gradecalculator.mes.fm/img/memes/".$current_meme['imgurl'],
            'title' => $current_meme['title'].' | Memes',
            'page_title' => $current_meme['title'],
            'page_description' => $current_meme['description'],
            'img_url' => $current_meme['imgurl'],
            'img_id' => $current_meme['id'],
            'next_meme' => $next_meme,
            'prev_meme' => $prev_meme,
            'rand_meme' => $rand_meme,
            'current_tab' => '2'
        )); 
		break;
	case '/wac': //weighted average calculator shortcut
		header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://gradecalculator.mes.fm/weighted-average-calculator");
		break;
	case '/weighted-average-calculator': //weighted average calculator
		echo $twig->render('calculator_wac.twig', array(
            'og_description' => 'Calculate what your weighted average grade is for all of your courses!',
			'resp_rect' => false,
			'resp_vert_mobile' => false,
			'social_media_url' => 'https://gradecalculator.mes.fm/weighted-average-calculator',
			'title' => 'Weighted Average Calculator',
			'page_title' => 'Weighted Average Calculator',
			'page_description' => 'This weighted average calculator calculates your average of all your courses. The weighted average simply takes into account how much each course is worth when calculating the average. This calculator can also be used to calculate any weighted average, not just courses.<br><br>
			Want to calculate your final exam grade? Then try our <a class="link" href="https://gradecalculator.mes.fm">Course/Exam Grade Calculator</a>',
            'current_tab' => '4'
		));
		break;
    case '/midterm':
    	header("HTTP/1.1 301 Moved Permanently"); 
		header("Location: https://gradecalculator.mes.fm/midterm-grade-calculator");
		break;
    case '/midterm-grade-calculator': //midterm calculator
		echo $twig->render($mobile ? 'calculator_midterm_mobile.twig' : 'calculator_midterm.twig', array(
            'og_description' => 'Calculate what grade you need on your midterm exam to get a desired grade so far in the course!',
            'keywords' => 'Midterm Grade Calculator, Grade Calculator, Final Grade Calculator, Final Exam Calculator, Math Easy Solutions',
            'title' => 'Midterm Grade Calculator',
            'page_title' => 'Midterm Grade Calculator',
            'page_description' => 'Calculate what grade you need on your midterm exam to get a desired grade so far in the course!<br><br>
			Want to calculate your final exam grade? Then try our <a class="link" href="https://gradecalculator.mes.fm">Course/Exam Grade Calculator</a>'
        ));    
        break;
    case '/tutorial': //video tutorial
        echo $twig->render('tutorial.twig', array(
        	'resp_rect' => false,
			'resp_vert_mobile' => false,
            'og_description' => 'Learn how to use our Grade Calculator as well as the calculations behind it through this tutorial video and article.',
            'title' => 'Tutorial',
            'page_title' => 'Grade Calculator Tutorial',
            'page_description' =>'This article, as well as the in the embedded video below, contain a simple tutorial on how to use our Grade Calculator as well as a thorough breakdown of the calculations behind it.',
            'tutorial_src' =>'//www.youtube.com/embed/KjAfCz-8e4w',
            'current_tab' => '5'
        ));    
        break;
    case '/weighted-average-tutorial': //wac video tutorial
        echo $twig->render('wac-tutorial.twig', array(
        	'resp_rect' => false,
			'resp_vert_mobile' => false,
            'og_description' => 'Learn how to use our Weighted Average Calculator as well as the calculations behind it through this tutorial video and article.',
            'title' => 'Weighted Average Tutorial',
            'page_title' => 'Weighted Average Tutorial',
            'page_description' =>'The concept of a weighted average, a basic average, and how to use our weighted average calculator is covered in this article as well as the embedded video below.',
            'tutorial_src' =>'//www.youtube.com/embed/3MR272aLzsA',
            'current_tab' => '6'
        ));    
        break;
    case '/br': //br version
		echo $twig->render($mobile ? 'calculator_br_mobile.twig' : 'calculator_br.twig', array(
			'resp_rect' => false,
			'br_view_comments' => 'Ver Comentários',
			'fb_js_src' => '//connect.facebook.net/pt_BR/all.js',
			'title' => 'Calculadora Nota Final',
			'og_title' => 'Calculadora Nota Final por Math Easy Solutions',
            'og_description' => 'Utilize este Calculadora Nota Final para calcular o que você precisa em seu exame para obter um grau desejado no curso!',
            'keywords' => 'Calculadora Nota Final, Calculadora Exame Final, Math Easy Solutions',
            'page_title' => 'Calculadora Nota Final',
            'page_description' => 'Esta calculadora nota final calcula o que você precisa em seu exame para obter um grau desejado no curso. Se você já se perguntou "o que eu preciso no meu exame final...?" então este site é para você!',
            'current_tab' => '9'
        ));    
        break;
    case '/contact': //contact
        echo $twig->render('contact.twig', array(
            'title' => 'Contact Us',
            'page_title' => 'Contact Us',
            'show_ads' => false
        )); 
        break;
    case '/contact': //contact
        echo $twig->render('contact.twig', array(
            'title' => 'Contact Us',
            'page_title' => 'Contact Us',
            'show_ads' => false
        )); 
        break;
    case '/privacy-policy': //privacy policy
		echo $twig->render('privacy_policy.twig', array(
            'og_description' => 'Check out Grade Calculator\' Privacy Policy!',
			'title' => 'Privacy Policy',
			'page_title' => 'Privacy Policy',
            'show_ads' => false
		));
		break;
    case '/subscribe':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://matheasy.substack.com/");
        break;
    case '/ios-app': //ios app shortcut
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://itunes.apple.com/ca/app/failsafe/id673084580");
        break;
    case '/android-app': //ios app shortcut
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://play.google.com/store/apps/details?id=com.mike.failsafefinalexamcalculator");
        break;
    case strpos($uri, '/search-results'): //search results
		echo $twig->render('search_results.twig', array(
			'title' => 'Search Results',
			'show_ads' => false,
			'show_articles' => false
		));
		break;
	default: //page not found
		header('HTTP/1.0 404 Not Found');
		echo $twig->render('page_not_found.twig', array(
			'title' => 'Page Not Found'
		));
}

?>