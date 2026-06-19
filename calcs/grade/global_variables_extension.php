<?php
class Global_Variables_Extension extends \Twig_Extension
{

    public function __construct($localhost,$mobile,$uri) 
    {
        $this->localhost = $localhost;
        $this->mobile = $mobile;
        $this->uri = rtrim($uri, '/');
        $this->base = $mobile ? 'base_mobile.twig' : 'base.twig';
        $this->root_domain = $localhost ? "" : "https://gradecalculator.mes.fm/";
    }

    public function getGlobals()
    {
        return array(
            'localhost' => $this->localhost,
            'root_domain' => $this->root_domain,
            'mobile' => $this->mobile,
            'base' => $this->base,
            'url' => 'https://gradecalculator.mes.fm'.$this->uri,
            'local_root' => 'grade',
            'tag_manager' => 'GTM-WZZ5V5G',
            'calc_name' => 'Grade Calculator',
            'dark_color' => '#575fab',
            'light_color' => '#e6e4f1',
            'highlight_color' => '#3f467d',
            'fb_id' => '292273677511642',
            'og_type' => 'website',
            'og_title' => 'Grade Calculator by Math Easy Solutions',
            'og_description' => 'Use this Grade Calculator to calculate what you need on your final exam to get a desired final grade in the course!',
            'ga_id' => 'UA-18189318-1',
            'url_short' => 'gradecalculator.mes.fm',
            'policy_date_modified' => 'Oct 8, 2014',
            'tag_line' => 'Calculate Your Final Exam Grade',
            'addthis_id' => 'ra-5486488c0460cb49',
            'show_ads' => $this->localhost ? false : true,
            'show_articles' => true,
            'carambo_ad' => 'div-gpt-ad-1427958177795-0',
            'carambo_ad_name' => 'FEC_728x350',
            'carambo_ad_300_600' => 'div-gpt-ad-1431554327783-0',
            'carambo_ad_name_300_600' => 'FEC_300x600',
            'contact_email' => 'gc@mes.fm',
            'disqus_url' => 'grademes',
            'num_navbar_items_mobile' => 5,
            'resp_rect' => true,
            'resp_vert_mobile' => true,
            'app_store_link' => 'https://itunes.apple.com/ca/app/failsafe/id673084580',
            'google_play_link' => 'https://play.google.com/store/apps/details?id=com.mike.failsafefinalexamcalculator',
            'subscribe_data' => array(
                'url' => 'https://mes.us13.list-manage.com/subscribe?u=dbcd5a985e8f82625fa9deab8&id=eca849230a',
                'form' => '//mes.us13.list-manage.com/subscribe/post?u=dbcd5a985e8f82625fa9deab8&amp;id=eca849230a',
                'id' => 'eca849230a'
                ),
            'ad_id' => array(
                'anchor' => '2967652461',
                'resp_horiz' => '6987176063',
                'resp_rect' => '6884601265',
                'resp_vert' => '1440170067',
                'link1' => '3353656461', // 200x90 #1
                'link2' => '4830389664', // 200x90 #2
                'link3' => '6517413264', // 728x15
                'm_link3' => '9047662468'
                ),
            'articles' => array(
                array(
                    'class' => 'latest-article',
                    'url' => 'https://itunes.apple.com/ca/app/failsafe/id673084580',
                    'tag_line' => 'Download the Grade Calculator iPhone App!',
                    'img_url' => '//mes.fm/main_img/apple-store-icon.jpg',
                    'img_alt' => 'apple store icon',
                    'title' => 'Grade Calculator for iOS'
                    )
                ),
            'social_medias' => array(
                'fb' => 'GradeCalculator',
                'twitter' => 'FinalGradeCalc',
                'insta' => 'gradecalculator',
                'gplus' => '+FinalExamCalculatorPage',
                'pin' => 'gradecalculator'
                ),
            'navbar' => array(
                array(
                    'url'=>$this->root_domain.'memes',
                    'label'=>'Memes'
                    ),
                array(
                    'url'=>$this->root_domain.'study-tips',
                    'label'=>'Study Tips'
                    ),
                array(
                    'url'=>$this->root_domain.'weighted-average-calculator',
                    'label'=>'Weighted Average'
                    ),
                array(
                    'url'=>$this->root_domain.'tutorial',
                    'label'=>'Tutorial'
                    ),
                array(
                    'url'=>$this->root_domain.'weighted-average-tutorial',
                    'label'=>'Weighted Average Tutorial'
                    ),
                array(
                    'url'=>$this->root_domain.'br',
                    'label'=>'Português'
                    )
                ),
            'navbar_mobile' => array(
                array(
                    'url'=>$this->root_domain.'memes',
                    'label'=>'Memes'
                    ),
                array(
                    'url'=>'https://itunes.apple.com/ca/app/failsafe/id673084580',
                    'label'=>'iPhone',
                    'link_window' => '_blank'
                    ),
                array(
                    'url'=>'https://play.google.com/store/apps/details?id=com.mike.failsafefinalexamcalculator',
                    'label'=>'Android',
                    'link_window' => '_blank'
                    ),
                array(
                    'url'=>$this->root_domain.'weighted-average-calculator',
                    'label'=>'Weight Avg.'
                    ),
                array(
                    'url'=>$this->root_domain.'study-tips',
                    'label'=>'Study Tips'
                    ),
                array(
                    'url'=>$this->root_domain.'br',
                    'label'=>'Português'
                    )
                )
        );
    }

    public function getName()
    {
        return 'Global_Variables_Extension';
    }
}
?>