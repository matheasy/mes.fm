<?php
class Global_Variables_Extension extends \Twig_Extension
{

    public function __construct($localhost,$mobile,$uri) 
    {
        $this->localhost = $localhost;
        $this->mobile = $mobile;
        $this->uri = rtrim($uri, '/');
        $this->base = $mobile ? 'base_mobile.twig' : 'base.twig';
        $this->root_domain = $localhost ? "" : "https://pokemongocalculator.mes.fm/";
    }

    public function getGlobals()
    {
        return array(
            'localhost' => $this->localhost,
            'root_domain' => $this->root_domain,
            'mobile' => $this->mobile,
            'base' => $this->base,
            'url' => 'https://pokemongocalculator.mes.fm'.$this->uri,
            'local_root' => 'pokemon',
            'tag_manager' => false,
            'calc_name' => 'Pokemon Go Calculator',
            'dark_color' => '#2d57a7',
            'light_color' => '#f2f2f2',
            'highlight_color' => '#1f3b71',
            'fb_id' => '1708977509364833',
            'og_type' => 'website',
            'og_title' => 'Pokemon Go Calculator by Math Easy Solutions',
            'og_description' => 'This Pokemon GO Calculator makes it easy for you to know how many pokemon you should transfer in order to make the lucky egg most efficient.',
            'ga_id' => 'UA-18189318-21',
            'url_short' => 'pokemongocalculator.mes.fm',
            'policy_date_modified' => 'July 19, 2016',
            'tag_line' => 'Calculate lucky egg efficiency',
            //'addthis_id' => 'ra-53b7585d09d9e0bd',
            'show_ads' => $this->localhost ? false : true,
            'show_articles' => false,
            'contact_email' => 'pgc@mes.fm',
            'disqus_url' => 'pokemongomes',
            'resp_rect' => true,
            'resp_vert_mobile' => true,
            'subscribe_data' => array(
                'url' => 'https://mes.us13.list-manage.com/subscribe?u=dbcd5a985e8f82625fa9deab8&id=34a95cd67d',
                'form' => '//mes.us13.list-manage.com/subscribe/post?u=dbcd5a985e8f82625fa9deab8&amp;id=34a95cd67d',
                'id' => '34a95cd67d'
                ),
            'ad_id' => array(
                'anchor' => '4382243664',
                'resp_horiz' => '7953476063',
                'resp_rect' => '7674274465',
                'resp_vert' => '4581207260',
                ),
            'social_medias' => array(
                'fb' => 'pokemongocalculator',
                //'twitter' => 'vat_calculator',
                //'gplus' => '+VATCalculatorCoPage',
                ),
            'navbar' => array(
                array(
                    'url'=>$this->root_domain.'experience-chart',
                    'label'=>'XP Chart'
                    )
                ),
            'navbar_mobile' => array(
                array(
                    'url'=>$this->root_domain.'experience-chart',
                    'label'=>'XP Chart'
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