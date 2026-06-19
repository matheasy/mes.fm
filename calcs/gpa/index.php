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
		echo $twig->render('calculator.twig', array(
			'gplus_author' => 'https://plus.google.com/+GpaCalculatorCoPage',
			'page_description' => 'This GPA calculator calculates your grade point average using a 4.33 or 4.0 scale. The GPA Scales can be found here: <a class="link" href="https://gpacalculator.mes.fm/gpa-scale-433">4.33 GPA Scale</a> and <a class="link" href="https://gpacalculator.mes.fm/gpa-scale-4">4.0 GPA Scale</a>.'
		));
		break;
    case '/tutorial': //video tutorial
        echo $twig->render('tutorial.twig', array(
            'og_description' => 'Learn how the GPA calculator works with this GPA Calculator Video Tutorial!',
            'title' => 'Tutorial',
            'page_title' => 'GPA Calculator Video Tutorial',
            'tutorial_src' =>'//www.youtube.com/embed/wEwOjGJmiDU',
            'current_tab' => '2'
        ));    
        break;
    case '/what-is-gpa': //what is gpa?
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://gpacalculator.mes.fm/grade-point-average");
        exit();
        break;
    case '/grade-point-average': //what is gpa?
        echo $twig->render('gpa.twig', array(
        	'og_description' => 'Learn what Grade Point Average really means!',
            'title' => 'Grade Point Average',
            'page_title' => 'Grade Point Average: Introduction and History to GPA',
            'current_tab' => '3'
        ));
        break;
    case '/gpa-scale-4': //4.0 gpa scale
        echo $twig->render('gpa_scale_4.twig', array(
        	'og_description' => 'Check out the 4.0 GPA Scale that is used by our GPA Calculator!',
            'title' => '4.0 GPA Scale',
            'page_description' => 'Wrong scale? Then check out the <a class="link" href="https://gpacalculator.mes.fm/gpa-scale-433">4.33 GPA Scale</a>!',
            'page_title' => '4.0 GPA Scale',
            'current_tab' => '4'
        ));
        break;
    case '/gpa-scale-433': //4.33 gpa scale
        echo $twig->render('gpa_scale_433.twig', array(
        	'og_description' => 'Check out the 4.33 GPA Scale that is used by our GPA Calculator!',        	
            'title' => '4.33 GPA Scale',
            'page_description' => 'Wrong scale? Then check out the <a class="link" href="https://gpacalculator.mes.fm/gpa-scale-4">4.0 GPA Scale</a>!',
            'page_title' => '4.33 GPA Scale',
            'current_tab' => '4'
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
            'title' => 'Privacy Policy',
            'page_title' => 'Privacy Policy',
            'show_ads' => false
        ));
        break;
    case '/subscribe':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://matheasy.substack.com/");
        break;
    case strpos($uri, '/search-results'): //search results
		echo $twig->render('search_results.twig', array(
			'title' => 'Search Results',
			'show_ads' => false,
		));
		break;
	default: //page not found
        header('HTTP/1.0 404 Not Found');
		echo $twig->render('page_not_found.twig', array(
			'title' => 'Page Not Found'
		));
}

?>