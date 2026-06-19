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
			'gplus_author' => 'https://plus.google.com/u/0/+PercentcalculatorMES',
			'page_description' => 'Our free online Percent Calculator calculates percentages such as ratios, fractions, statistics, and percentage increase or decrease.<br><br>
			The calculations and formulas (press the \'?\' button) are calculated automatically as you type!<br><br>Learn the basics of percentages: <a class="link" href="https://percentagecalculator.mes.fm/how-do-you-calculate-percentages">How to Calculate Percentages</a>',
            // 'matched_content' => 1,
		));
		break;
    case '/percentage-facts': //percentage-facts redirect to interesting-facts

        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://percentagecalculator.mes.fm/interesting-facts");
        exit();

        break;
    case strpos($uri, '/percentage-facts/'): //percentage-facts redirect to interesting-facts
        $id = explode('percentage-facts/', $uri);
        $id = $id[1];
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://percentagecalculator.mes.fm/interesting-facts/".$id);
        exit();

        break;
    case '/interesting-facts': //interesting facts
        require_once '../../main_lib/memes_lib.php';
        $mes_memes = new MES_Memes('memes_pc');

        $pageNumber = isset($_GET['p']) ? $_GET['p'] : 1;

        $all_data = $mes_memes->all_meme_data($pageNumber,$type=2);
        $data = $all_data[0];
        $num_memes = $all_data[1];

        echo $twig->render('memes_gallery.twig', array(
            'memes_dir' => 'interesting-facts',
            'subscribe_data_option_2' => 'Interesting Facts',
            'og_description' => 'Check out Percentage Calculator\'s Interesting Facts!',
            'title' => 'Interesting Facts',
            'page_title' => $data ? 'Interesting Facts' : 'No interesting facts to show here! :(',
            'items_per_row' => $mobile ? 2 : 4,
            'page_description' => 'Learn something new by checking out some of these amazing, bizarre, profound, and very interesting facts about we as humans as well as the world around us!',
            'data' => $data,
            'page' => $pageNumber,
            'max_page' => ceil($num_memes/20),
            'current_tab' => '2'
        )); 
        break;
    case strpos($uri, '/interesting-facts/'): //interesting facts single page
        require_once '../../main_lib/memes_lib.php';
        $mes_meme = new MES_Memes('memes_pc');

        $url = explode('interesting-facts/', $uri);
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
            'memes_dir' => 'interesting-facts',
            'subscribe_data_option_2' => 'Interesting Facts',
            'og_description' => $current_meme['description'],
            'og_img_url' => "https://percentagecalculator.mes.fm/img/memes/".$current_meme['imgurl'],
            'title' => $current_meme['title'].' | Interesting Facts',
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
	case '/memes': //memes
		require_once '../../main_lib/memes_lib.php';
		$mes_memes = new MES_Memes('memes_pc');

		$pageNumber = isset($_GET['p']) ? $_GET['p'] : 1;

		$all_data = $mes_memes->all_meme_data($pageNumber,$type=1);
		$data = $all_data[0];
		$num_memes = $all_data[1];

        echo $twig->render('memes_gallery.twig', array(
            'subscribe_data_option_2' => 'Percentage Memes',
            'og_description' => 'Check out Percentage Calculator\'s Memes!',
            'title' => 'Memes',
            'page_title' => $data ? 'Memes' : 'No memes to show here! :(',
            'items_per_row' => $mobile ? 2 : 4,
            'page_description' => 'The funniest and most hilarious percentage photos and memes from around the web!',
            'data' => $data,
            'page' => $pageNumber,
            'max_page' => ceil($num_memes/20),
            'current_tab' => '3'
        )); 
		break;
	case strpos($uri, '/memes/'): //memes single page
		require_once '../../main_lib/memes_lib.php';
		$mes_meme = new MES_Memes('memes_pc');

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
            'subscribe_data_option_2' => 'Percentage Memes',
            'og_description' => $current_meme['description'],
            'og_img_url' => "https://percentagecalculator.mes.fm/img/memes/".$current_meme['imgurl'],
            'title' => $current_meme['title'].' | Memes',
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
    case '/tutorial': //video tutorial
        echo $twig->render('tutorial.twig', array(
            'og_description' => 'Learn how the percentages are calculated with this Percentage Calculator Video Tutorial!',
            'title' => 'Tutorial',
            'page_title' => 'Percentage Calculator Tutorial',
            'tutorial_src' =>'//www.youtube.com/embed/wxbwPBve4sQ',
            'page_description' => 'In this article as well as in the video below I go over an in-depth tutorial on how to use our percentage calculator as well as deriving the formulas shown for each of the calculations by hand.',
            'current_tab' => '4'
        ));    
        break;
    case '/how-do-you-calculate-percentages': //how to calculate percentages
        echo $twig->render('calculate-percentages.twig', array(
            'og_description' => 'Some of the most frequently asked questions regarding what percentages are and how to calculate them in terms of percentage change, percentage increase, and working out percentages on a calcualtor are covered in this article.',
            'title' => 'How Do You Calculate Percentages?',
            'page_title' => 'How Do You Calculate Percentages?',
            'page_description' => 'In this article, many of the common and frequently asked questions regarding calculating and understanding percentages are covered. If you have any further questions that we have not covered, please let us know by commenting below!',
            'keywords' => 'how do you calculate percentage increase, how do you work out the percentage of something, how do you work out percentages on a calculator, how do you find the percentage of something, how do you calculate percent change, Percentage Calculator, Percent Calculator, Math Easy Solutions',
            'current_tab' => '5'
        ));    
        break;
    case '/contact': //contact
        echo $twig->render('contact.twig', array(
            'title' => 'Contact Us',
            'page_title' => 'Contact Us',
            'og_description' => 'Contact the Math Easy Solutions team!',
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
    case '/subscribe': //subscribe shortcut
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://matheasy.substack.com/");
        break;
    case '/ios-app': //ios app shortcut
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://itunes.apple.com/ca/app/percentage-calculator-by-math/id1141583865");
        break;
    case '/android-app': //android app shortcut
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://play.google.com/store/apps/details?id=com.mike.percentageCalculator");
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