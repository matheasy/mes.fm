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
    //$mobile = false;
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
			'gplus_author' => 'https://plus.google.com/u/0/102904645385726760971',
			'page_description' => 'This mortgage calculator calculates your monthly mortgage payment and taxes.<br><br>
            It is important to understand how your mortgage payments are affected based on different interest, loan terms, etc. which is why we have added very useful notes in each of the sections below.',
            'secondary_page_ads' => 0
		));
		break;
    case '/test': //e-book
        echo $twig->render('justanswer.twig');
        break;
    case '/dream-homes': //memes
        require_once '../../main_lib/memes_lib.php';
        $mes_memes = new MES_Memes('memes_mc');

        $pageNumber = isset($_GET['p']) ? $_GET['p'] : 1;

        $all_data = $mes_memes->all_meme_data($pageNumber);
        $data = $all_data[0];
        $num_memes = $all_data[1];

        echo $twig->render('memes_gallery.twig', array(
            'secondary_page_ads' => 0,
            'subscribe_data_option_2' => 'Dream Homes',
            'og_description' => 'Check out Mortgage Calculator\'s Dream Homes!',
            'title' => 'Dream Homes',
            'page_title' => $data ? 'Dream Homes' : 'No dream homes to show here! :(',
            'items_per_row' => $mobile ? 2 : 4,
            'page_description' => 'Discover some absolutely stunning homes all over the world!',
            'data' => $data,
            'page' => $pageNumber,
            'max_page' => ceil($num_memes/20),
            'current_tab' => '2'
        )); 
        break;
    case strpos($uri, '/dream-homes/'): //memes single page
        require_once '../../main_lib/memes_lib.php';
        $mes_meme = new MES_Memes('memes_mc');

        $url = explode('dream-homes/', $uri);
        $url = $url[1];
        $all_data = $mes_meme->single_meme_data($url);
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
            'subscribe_data_option_2' => 'Dream Homes',
            'og_description' => $current_meme['description'],
            'og_img_url' => "https://mortgagecalculator.mes.fm/img/memes/".$current_meme['imgurl'],
            'title' => $current_meme['title'].' | Dream Homes',
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
	case '/formulas': //formulas
        echo $twig->render('formulas.twig', array(
            'og_description' => 'Check out the formulas used in our Mortgage Calculator!',
            'title' => 'Formulas',
            'page_title' => 'Formulas',
            'current_tab' => '3'
        ));
        break;
    case '/amortization-formula': //amortization formula
        echo $twig->render('amortization-formula.twig', array(
            'og_description' => 'Check out the formula used to calculate Mortgage Amortization!',
            'title' => 'Mortgage Amortization Formula (Basic)',
            'page_title' => 'Mortgage Amortization Formula (Basic)',
            'current_tab' => '3'
        ));  
        break;
    case '/balloon-payment-formula': //balloon payment formula
        echo $twig->render('balloon-payment-formula.twig', array(
            'og_description' => 'Check out the formula used to calculate Mortgage Amortization with Balloon Payment!',
            'title' => 'Mortgage Amortization Formula with Balloon Payment',
            'page_title' => 'Mortgage Amortization Formula with Balloon Payment',
            'current_tab' => '3'
        ));  
        break;
    case '/amortization-formula-proof': //amortization formula proof
        echo $twig->render('amortization-formula-proof.twig', array(
            'og_description' => 'Check out the Mortgage Amortization Formula Proof with Balloon Payment!',
            'title' => 'Mortgage Amortization Formula Proof with Balloon Payment',
            'page_title' => 'Mortgage Amortization Formula Proof with Balloon Payment',
            'current_tab' => '3'
        ));  
        break;
    case '/mortgage-definition': //mortgage definition
        echo $twig->render('mortgage-definition.twig', array(
            'og_description' => 'Check out the definition of a mortgage!',
            'title' => 'Mortgage Definition',
            'page_title' => 'Mortgage Definition',
            'current_tab' => '4'
        ));  
        break;
    case '/financial-advice/how-to-get-accepted-for-a-mortgage': //financial advice
        echo $twig->render('mortgage-acceptance.twig', array(
            'og_description' => 'Mortgage Acceptance',
            'title' => 'Mortgage Acceptance | Financial Advice',
            'page_title' => 'How to get Accepted for a Mortgage',
            'author' => 'Chrissy Hicks',
            'visible_date' => 'February 24, 2018',
            'current_tab' => '5'
        ));
        break;
    case '/tutorial': //video tutorial
        echo $twig->render('tutorial.twig', array(
            'og_description' => 'Learn how the mortgage calculator works with this Mortgage Calculator Tutorial!',
            'title' => 'Tutorial',
            'page_title' => 'Mortgage Calculator Tutorial',
            'tutorial_src' =>'//www.youtube.com/embed/IZkpH9bWgPU',
            'current_tab' => '6'
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