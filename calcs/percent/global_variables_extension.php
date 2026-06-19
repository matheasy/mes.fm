<?php
class Global_Variables_Extension extends \Twig_Extension
{

    public function __construct($localhost,$mobile,$uri) 
    {
        $this->localhost = $localhost;
        $this->mobile = $mobile;
        $this->uri = rtrim($uri, '/');
        $this->base = $mobile ? 'base_mobile.twig' : 'base.twig';
        $this->root_domain = $localhost ? "" : "https://percentagecalculator.mes.fm/";
    }

    public function getGlobals()
    {
        return array(
            'localhost' => $this->localhost,
            'root_domain' => $this->root_domain,
            'mobile' => $this->mobile,
            'base' => $this->base,
            'url' => 'https://percentagecalculator.mes.fm'.$this->uri,
            'local_root' => 'percent',
            'tag_manager' => 'GTM-T7H6J87',
            'calc_name' => 'Percentage Calculator',
            'dark_color' => '#55acee',
            'light_color' => '#daf1fd',
            'highlight_color' => '#478fc6',
            'fb_id' => '1398196443773284',
            'og_type' => 'website',
            'og_title' => 'Percentage Calculator by Math Easy Solutions',
            'og_description' => 'Our free online Percent Calculator calculates percentages such as ratios, fractions, statistics, and percentage increase or decrease.',
            'ga_id' => 'UA-18189318-5',
            'url_short' => 'percentagecalculator.mes.fm',
            'policy_date_modified' => 'Oct 8, 2014',
            'tag_line' => 'Calculate Percent Increase or Decrease, Ratios, Fractions, and More',
            // 'addtoany' => 0,
            'addthis_id' => 'ra-544ddd9039e0dce2',
            'show_ads' => true,
            'matched_content' => 1,
            'hide_search' => true,
            'matched_content' => false,
            'show_articles' => true,
            'carambo_ad' => 'div-gpt-ad-1427958267735-0',
            'carambo_ad_name' => 'PC_728x350',
            'carambo_ad_300_600' => 'div-gpt-ad-1431662996288-0',
            'carambo_ad_name_300_600' => 'PC_300x600',
            'dfp_ad_name' => 'PC',
            'contact_email' => 'pc@mes.fm',
            'disqus_url' => 'percentagemes',
            'app_store_link' => 'https://itunes.apple.com/ca/app/percentage-calculator-by-math/id1141583865',
            'google_play_link' => 'https://play.google.com/store/apps/details?id=com.mike.percentageCalculator',
            'subscribe_data' => array(
                'url' => 'https://percentcalculator.us13.list-manage2.com/subscribe?u=dbcd5a985e8f82625fa9deab8&id=0400ae0b57',
                'form' => '//percentcalculator.us13.list-manage.com/subscribe/post?u=dbcd5a985e8f82625fa9deab8&id=0400ae0b57',
                'id' => '0400ae0b57'
            ),
            'ad_id' => array(
                'anchor' => '9854157265',
                'resp_horiz' => '3614907262',
                'resp_rect' => '1616796862',
                'resp_vert' => '3974834064',
                'hide_bottom_ad' => true,
                'link1' => '8202658468', // 200x90 #1
                'link2' => '2016524064', // 200x90 #1
                'link3' => '8092098864', // 728x15
                'm_link3' => '9476151265',
                'dfp_300_250' => 'div-gpt-ad-1441220055009-0'
                ),
            'social_medias' => array(
                'fb' => 'PercentCalculator',
                'twitter' => 'Percentage_Calc',
                'insta' => 'percentagecalculator',
                'gplus' => '+PercentcalculatorMES',
                'pin' => 'percentagecalc'
                ),
            'navbar' => array(
                array(
                    'url'=>$this->root_domain.'interesting-facts',
                    'label'=>'Interesting Facts'
                    ),
                array(
                    'url'=>$this->root_domain.'memes',
                    'label'=>'Memes'
                    ),
                array(
                    'url'=>$this->root_domain.'tutorial',
                    'label'=>'Tutorial'
                    ),
                array(
                    'url'=>$this->root_domain.'how-do-you-calculate-percentages',
                    'label'=>'Percentages How-To'
                    )
                ),
            'navbar_mobile' => array(
                array(
                    'url'=>$this->root_domain.'interesting-facts',
                    'label'=>'Interesting Facts'
                    ),
                array(
                    'url'=>$this->root_domain.'tutorial',
                    'label'=>'Tutorial'
                    ),
                array(
                    'url'=>'https://itunes.apple.com/ca/app/percentage-calculator-by-math/id1141583865',
                    'label'=>'iOS App',
                    'link_window' => '_blank'
                    ),
                array(
                    'url'=>'https://play.google.com/store/apps/details?id=com.mike.percentageCalculator',
                    'label'=>'Android App',
                    'link_window' => '_blank'
                    ),

                )
        );
    }

    public function getName()
    {
        return 'Global_Variables_Extension';
    }
}
?>