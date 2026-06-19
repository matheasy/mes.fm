<?php
class Global_Variables_Extension extends \Twig_Extension
{

    public function __construct($localhost,$mobile,$uri) 
    {
        $this->localhost = $localhost;
        $this->mobile = $mobile;
        $this->uri = rtrim($uri, '/');
        $this->base = $mobile ? 'base_mobile.twig' : 'base.twig';
        $this->root_domain = $localhost ? "" : "https://gpacalculator.mes.fm/";
    }

    public function getGlobals()
    {
        return array(
            'localhost' => $this->localhost,
            'root_domain' => $this->root_domain,
            'mobile' => $this->mobile,
            'base' => $this->base,
            'url' => 'https://gpacalculator.mes.fm'.$this->uri,
            'local_root' => 'gpa',
            'tag_manager' => 'GTM-MWQXS4P',
            'calc_name' => 'GPA Calculator',
            'dark_color' => '#84bc41',
            'light_color' => '#f0f5cb',
            'highlight_color' => '#69ac29',
            'fb_id' => '740416762637294',
            'og_type' => 'website',
            'og_title' => 'GPA Calculator by Math Easy Solutions',
            'og_description' => 'Use this GPA Calculator to calculate your grade point average using a 4.33 or 4.0 scale!',
            'ga_id' => 'UA-18189318-6',
            'url_short' => 'gpacalculator.mes.fm',
            'policy_date_modified' => 'Oct 8, 2014',
            'tag_line' => 'Calculate your GPA using a 4.33 or 4.0 GPA scale',
            'addthis_id' => 'ra-53b7585d09d9e0bd',
            'show_ads' => $this->localhost ? false : true,
            'show_articles' => false,
            'carambo_ad' => 'div-gpt-ad-1427958425396-0',
            'carambo_ad_name' => 'GPA_728x350',
            'carambo_ad_300_600' => 'div-gpt-ad-1431671481116-0',
            'carambo_ad_name_300_600' => 'GPA_300x600',
            'contact_email' => 'gpa@mes.fm',
            'disqus_url' => 'gpames',
            'subscribe_data' => array(
                'url' => 'https://gpacalculator.us13.list-manage1.com/subscribe?u=dbcd5a985e8f82625fa9deab8&id=c4a8aca07a',
                'form' => '//gpacalculator.us13.list-manage.com/subscribe/post?u=dbcd5a985e8f82625fa9deab8&amp;id=c4a8aca07a',
                'id' => 'c4a8aca07a'
                ),
            'resp_rect' => true,
            'resp_vert_mobile' => true,
            'ad_id' => array(
                'anchor' => '3161838862',
                'resp_horiz' => '5370842060',
                'resp_rect' => '8082132869',
                'resp_vert' => '7347102863',
                '728x90' => '6945435155',
                '300x600' => '9510447263',
                '336x280' => '2126781260',
                'link1' => '8990839391',
                'link2' => '4928448742',
                'link3' => '3463913664',
                'm_anchor' => '',
                'm_320x100' => '5007002064',
                'm_300x250' => '6983262862',
                'm_300x250_2' => '2706010460',
                'm_link1' => '6996609269',
                'm_link2' => '2287208066',
                'm_link3' => '6717407666'
                ),
            'social_medias' => array(
                'fb' => 'GPACalculatorMES',
                'twitter' => 'GPACalculator_',
                'gplus' => '+GpaCalculatorCoPage',
                ),
            'navbar' => array(
                array(
                    'url'=>$this->root_domain.'tutorial',
                    'label'=>'Tutorial'
                    ),
                array(
                    'url'=>$this->root_domain.'grade-point-average',
                    'label'=>'What is GPA?'
                    ),
                array(
                    'url'=>$this->root_domain.'gpa-scale-4',
                    'label'=>'GPA Scales',
                    'dropdown'=> array(
                        array(
                            'url'=>$this->root_domain.'gpa-scale-4',
                            'label'=>'4.0 GPA Scale',
                            ),
                        array(
                            'url'=>$this->root_domain.'gpa-scale-433',
                            'label'=>'4.33 GPA Scale',
                            )
                        ),
                    ),
                ),
            'navbar_mobile' => array(
                array(
                    'url'=>$this->root_domain.'tutorial',
                    'label'=>'Tutorial'
                    ),
                array(
                    'url'=>$this->root_domain.'grade-point-average',
                    'label'=>'What is GPA?'
                    ),
                array(
                    'url'=>$this->root_domain.'gpa-scale-4',
                    'label'=>'GPA Scales'
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